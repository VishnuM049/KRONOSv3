import pandas as pd
from datetime import datetime, timedelta
from ortools.sat.python import cp_model
import sys
import time
import joblib
import json
import shap
import numpy as np

# --- 1. CONFIGURATION AND MODELS (Loaded once) ---
SIMULATION_START_DATE = datetime(2025, 9, 1)
SIMULATION_MONTH_DAYS = 30
DAILY_KM_PER_TRAIN = 200
DAILY_HOURS_PER_TRAIN = 16
CERTIFICATE_VALIDITY_DAYS = 365
BOGIE_SERVICE_INTERVAL_KM = 25000
PENALTY_PER_EXPIRED_DAY = 5

try:
    AI_STRATEGIST_MODEL = joblib.load("strategy_model.joblib")
except FileNotFoundError:
    AI_STRATEGIST_MODEL = None

SCENARIO_MODIFIERS = {
    "NORMAL": {"MIN_SERVICE": 6, "MAX_SERVICE": 6, "MAINTENANCE_SLOTS": 2},
    "HEAVY_MONSOON": {"MIN_SERVICE": 6, "MAX_SERVICE": 6, "MAINTENANCE_SLOTS": 2, "WEATHER_PENALTY_OLD_BRAKES": 15000, "WEATHER_PENALTY_BOGIE_WEAR": 20000},
    "FESTIVAL_SURGE": {"MIN_SERVICE": 7, "MAX_SERVICE": 8, "MAINTENANCE_SLOTS": 1}
}

# --- 2. HELPER FUNCTIONS ---
def initialize_fleet_status(base_file="fleet_data.csv", output_file="fleet_status.csv"):
    df = pd.read_csv(base_file)
    df['bogie_last_service_km'] = df['current_km']
    df['current_hours'] = 0.0
    df['consecutive_service_days'] = 0
    df['total_service_days_month'] = 0
    df['total_maintenance_days_month'] = 0
    df['target_hours'] = df['target_hours'].fillna(0)
    df.to_csv(output_file, index=False)
    print(f"Fleet status for new month initialized in '{output_file}'")

def preprocess_and_health_score(df, current_day, manual_inputs):
    df['cert_telecom_expiry'] = pd.to_datetime(df['cert_telecom_expiry'])
    today = SIMULATION_START_DATE + timedelta(days=current_day - 1)
    df['is_cert_expired'] = df['cert_telecom_expiry'] < today
    df['health_score'] = 100.0
    df['km_since_last_service'] = df['current_km'] - df['bogie_last_service_km']
    df['health_score'] -= (df['km_since_last_service'] / 200).astype(float)
    if 'consecutive_service_days' in df.columns:
        df['health_score'] -= df['consecutive_service_days']
    expired_trains = df[df['is_cert_expired']].index
    if not expired_trains.empty:
        days_expired = (today - df.loc[expired_trains, 'cert_telecom_expiry']).dt.days
        expired_penalty = days_expired * PENALTY_PER_EXPIRED_DAY
        df.loc[expired_trains, 'health_score'] -= expired_penalty
    priority_penalties = {'LOW': 10, 'MEDIUM': 20, 'CRITICAL': 50}
    for p, penalty in priority_penalties.items():
        df.loc[(df['job_card_status'] == 'OPEN') & (df['job_card_priority'] == p), 'health_score'] -= penalty
    df['manual_force_maintenance'] = False
    for train_id, override in manual_inputs.items():
        if 'health_penalty' in override: df.loc[df['train_id'] == train_id, 'health_score'] -= override['health_penalty']
        if 'force_maintenance' in override: df.loc[df['train_id'] == train_id, 'manual_force_maintenance'] = True
    df['health_score'] = df['health_score'].clip(lower=0)
    return df

def solve_daily_optimization(fleet_df, current_day, scenario, dynamic_strategy={}):
    model = cp_model.CpModel()
    modifiers = SCENARIO_MODIFIERS[scenario]
    FATIGUE_PENALTY_FACTOR = dynamic_strategy.get('fatigue_factor', 500)
    PER_KM_DEVIATION_COST = dynamic_strategy.get('cost_per_km', 5)
    BRANDING_SLA_PENALTY = dynamic_strategy.get('branding_penalty', 50000)
    TARGET_MONTHLY_KM = dynamic_strategy.get('target_mileage', 6000)
    HEALTH_SCORE_MAINTENANCE_THRESHOLD = dynamic_strategy.get('maint_threshold', 50)
    is_in_service = {r['train_id']: model.NewBoolVar(f"s_{r['train_id']}") for _, r in fleet_df.iterrows()}
    is_in_maintenance = {r['train_id']: model.NewBoolVar(f"m_{r['train_id']}") for _, r in fleet_df.iterrows()}
    is_on_standby = {r['train_id']: model.NewBoolVar(f"b_{r['train_id']}") for _, r in fleet_df.iterrows()}
    for _, row in fleet_df.iterrows():
        tid = row['train_id']
        model.Add(is_in_service[tid] + is_in_maintenance[tid] + is_on_standby[tid] == 1)
        if row['is_cert_expired'] or row['job_card_priority'] == 'CRITICAL': model.Add(is_in_service[tid] == 0)
        if row['health_score'] < HEALTH_SCORE_MAINTENANCE_THRESHOLD or row['manual_force_maintenance']:
            model.Add(is_in_maintenance[tid] == 1)
    model.Add(sum(is_in_service.values()) <= modifiers['MAX_SERVICE'])
    total_objective = []
    num_in_service = sum(is_in_service.values())
    shortfall = model.NewIntVar(0, modifiers['MIN_SERVICE'], 'shortfall')
    model.Add(shortfall >= modifiers['MIN_SERVICE'] - num_in_service)
    total_objective.append(shortfall * 5000000)
    num_in_maint = sum(is_in_maintenance.values())
    maint_dev = model.NewIntVar(-len(fleet_df), len(fleet_df), 'maint_dev')
    model.Add(maint_dev == num_in_maint - modifiers['MAINTENANCE_SLOTS'])
    abs_maint_dev = model.NewIntVar(0, len(fleet_df), 'abs_maint_dev')
    model.AddAbsEquality(abs_maint_dev, maint_dev)
    total_objective.append(abs_maint_dev * 1000000)
    for _, row in fleet_df.iterrows():
        tid, service_var = row['train_id'], is_in_service[row['train_id']]
        consecutive_days = row.get('consecutive_service_days', 0)
        fatigue_cost = int((consecutive_days**2) * FATIGUE_PENALTY_FACTOR)
        ideal_km = (TARGET_MONTHLY_KM / SIMULATION_MONTH_DAYS) * current_day
        urgency_multiplier = current_day / SIMULATION_MONTH_DAYS
        mileage_cost = int(abs(row['current_km'] - ideal_km) * PER_KM_DEVIATION_COST * urgency_multiplier)
        service_cost = fatigue_cost + mileage_cost
        if scenario == "HEAVY_MONSOON":
            if row['brake_model'] == 'HydroMech_v1': service_cost += modifiers['WEATHER_PENALTY_OLD_BRAKES']
            if row['km_since_last_service'] > BOGIE_SERVICE_INTERVAL_KM: service_cost += modifiers['WEATHER_PENALTY_BOGIE_WEAR']
        total_objective.append(service_cost * service_var)
        total_objective.append(int(row['health_score']) * is_in_maintenance[tid])
        if row['branding_sla_active']:
            hours_needed = row['target_hours'] - row['current_hours']
            if hours_needed > 0:
                run_rate = hours_needed / (SIMULATION_MONTH_DAYS - current_day + 1)
                urgency = run_rate / DAILY_HOURS_PER_TRAIN
                penalty = int(BRANDING_SLA_PENALTY * urgency)
                total_objective.append(penalty * (1 - service_var))
    model.Minimize(sum(total_objective))
    solver = cp_model.CpSolver()
    status = solver.Solve(model)
    if status in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
        plan = {'SERVICE': [], 'MAINTENANCE': [], 'STANDBY': []}
        for _, r in fleet_df.iterrows():
            if solver.Value(is_in_service[r['train_id']]): plan['SERVICE'].append(r['train_id'])
            elif solver.Value(is_in_maintenance[r['train_id']]): plan['MAINTENANCE'].append(r['train_id'])
            else: plan['STANDBY'].append(r['train_id'])
        return plan, int(solver.ObjectiveValue())
    return None, None

def apply_daily_updates(df, plan, current_day):
    service_trains, maintenance_trains = plan['SERVICE'], plan['MAINTENANCE']
    today = SIMULATION_START_DATE + timedelta(days=current_day - 1)
    if 'consecutive_service_days' not in df.columns: df['consecutive_service_days'] = 0
    df.loc[df['train_id'].isin(service_trains), 'consecutive_service_days'] += 1
    df.loc[~df['train_id'].isin(service_trains), 'consecutive_service_days'] = 0
    df.loc[df['train_id'].isin(service_trains), 'current_km'] += DAILY_KM_PER_TRAIN
    branded_service = df[(df['train_id'].isin(service_trains)) & (df['branding_sla_active'])]
    df.loc[df.index.isin(branded_service.index), 'current_hours'] += DAILY_HOURS_PER_TRAIN
    for train_id in maintenance_trains:
        train_index = df[df['train_id'] == train_id].index
        current_expiry = pd.to_datetime(df.loc[train_index, 'cert_telecom_expiry'].iloc[0])
        if current_expiry < today:
            new_expiry_date = today + timedelta(days=CERTIFICATE_VALIDITY_DAYS)
            df.loc[train_index, 'cert_telecom_expiry'] = new_expiry_date
    df.loc[df['train_id'].isin(maintenance_trains), 'health_score'] = 100
    df.loc[df['train_id'].isin(maintenance_trains), 'bogie_last_service_km'] = df.loc[df['train_id'].isin(maintenance_trains), 'current_km']
    maintained_indices = df[df['train_id'].isin(maintenance_trains)].index
    df.loc[maintained_indices, 'job_card_status'] = 'CLOSED'
    df.loc[maintained_indices, 'job_card_priority'] = 'NONE'
    if 'total_service_days_month' not in df.columns: df['total_service_days_month'] = 0
    if 'total_maintenance_days_month' not in df.columns: df['total_maintenance_days_month'] = 0
    df.loc[df['train_id'].isin(service_trains), 'total_service_days_month'] += 1
    df.loc[df['train_id'].isin(maintenance_trains), 'total_maintenance_days_month'] += 1
    return df

# --- 3. THE UNIFIED SIMULATION ENGINE FUNCTION WITH READABLE SHAP ---
def run_simulation(start_day, initial_fleet_state, ai_model, feature_names, targets, manual_overrides={}):
    if ai_model is None:
        raise Exception("AI Strategist model is not loaded.")
        
    monthly_log = []
    fleet_df = initial_fleet_state.copy()

    MONTHLY_SCENARIOS = ['NORMAL'] * SIMULATION_MONTH_DAYS
    MONTHLY_SCENARIOS[6] = MONTHLY_SCENARIOS[7] = 'FESTIVAL_SURGE'
    MONTHLY_SCENARIOS[12] = MONTHLY_SCENARIOS[13] = 'HEAVY_MONSOON'
    MONTHLY_SCENARIOS[21] = 'FESTIVAL_SURGE'
    
    MANUAL_INPUTS_CALENDAR = {
        5: {"Rake-12": {"health_penalty": 40, "reason": "Visual inspection"}},
        15: {"Rake-19": {"force_maintenance": True, "reason": "Driver report"}}
    }
    for day, override in manual_overrides.items():
        MANUAL_INPUTS_CALENDAR[int(day)] = override

    def shap_to_readable(features, shap_values, threshold=0.01):
        explanations = []
        for feature, val in zip(features, shap_values):
            if abs(val) < threshold:
                explanations.append(f"{feature} has no effect")
            else:
                qualifier = "slightly" if abs(val) < 0.05 else "moderately" if abs(val) < 0.15 else "strongly"
                direction = "increases" if val > 0 else "decreases"
                explanations.append(f"{feature} {direction} predicted outcome by {abs(val):.2f} ({qualifier})")
        return explanations

    for day in range(start_day, SIMULATION_MONTH_DAYS + 1):
        scenario = MONTHLY_SCENARIOS[day - 1]
        manual_inputs_today = MANUAL_INPUTS_CALENDAR.get(day, {})
        
        fleet_df_processed = preprocess_and_health_score(fleet_df, day, manual_inputs_today)

        current_conditions = {
            'total_fleet_size': len(fleet_df_processed), 
            'target_service_trains': SCENARIO_MODIFIERS[scenario]['MIN_SERVICE'], 
            'avg_fleet_health': fleet_df_processed['health_score'].mean(), 
            'is_monsoon': 1 if scenario == 'HEAVY_MONSOON' else 0, 
            'is_surge': 1 if scenario == 'FESTIVAL_SURGE' else 0
        }
        conditions_df = pd.DataFrame([current_conditions])[feature_names]
        
        predicted_strategy = ai_model.predict(conditions_df)[0]
        dynamic_strategy = {
            'cost_per_km': predicted_strategy[0], 'fatigue_factor': predicted_strategy[1], 
            'branding_penalty': predicted_strategy[2], 'target_mileage': predicted_strategy[3], 
            'maint_threshold': predicted_strategy[4]
        }
        
        shap_explanations = []
        for i, estimator in enumerate(ai_model.estimators_):
            explainer = shap.TreeExplainer(estimator)
            shap_values_raw = explainer.shap_values(conditions_df)
            sv = np.array(shap_values_raw)
            if sv.ndim >= 2 and sv.shape[0] == 1:
                sv = np.squeeze(sv, axis=0)

            # Base SHAP explanation dictionary
            explanation = {
                "output_name": targets[i],
                "base_value": float(explainer.expected_value) if np.isscalar(explainer.expected_value) else explainer.expected_value.tolist(),
                "shap_values": sv.tolist(),
                "readable": shap_to_readable(feature_names, sv)
            }
            shap_explanations.append(explanation)

        
        daily_plan, daily_cost = solve_daily_optimization(fleet_df_processed, day, scenario, dynamic_strategy)
        
        if daily_plan:
            fleet_status_before = fleet_df_processed.copy()
            fleet_status_before['cert_telecom_expiry'] = fleet_status_before['cert_telecom_expiry'].dt.strftime('%Y-%m-%d')

            updated_df = apply_daily_updates(fleet_df_processed.copy(), daily_plan, day)
            fleet_status_after = updated_df.copy()
            fleet_status_after['cert_telecom_expiry'] = fleet_status_after['cert_telecom_expiry'].dt.strftime('%Y-%m-%d')
            
            daily_log_entry = {
                "day": day,
                "scenario": scenario,
                "plan": daily_plan,
                "cost": daily_cost,
                "ai_strategy": dynamic_strategy,
                "fleet_status_before": fleet_status_before.to_dict(orient='records'),
                "fleet_status_after": fleet_status_after.to_dict(orient='records'),
                "shap_explanations": shap_explanations,
                "feature_names": feature_names,
                "feature_values": conditions_df.iloc[0].tolist()
            }
            monthly_log.append(daily_log_entry)
            
            fleet_df = updated_df
        else:
            print(f"CRITICAL FAILURE on Day {day}. Halting simulation.")
            break
            
    return monthly_log



# --- 3. THE UNIFIED SIMULATION ENGINE FUNCTION ---
#def run_simulation(start_day, initial_fleet_state, ai_model, feature_names, targets, manual_overrides={}):
    if ai_model is None:
        raise Exception("AI Strategist model is not loaded.")
        
    monthly_log = []
    fleet_df = initial_fleet_state.copy()

    MONTHLY_SCENARIOS = ['NORMAL'] * SIMULATION_MONTH_DAYS
    MONTHLY_SCENARIOS[6] = MONTHLY_SCENARIOS[7] = 'FESTIVAL_SURGE'
    MONTHLY_SCENARIOS[12] = MONTHLY_SCENARIOS[13] = 'HEAVY_MONSOON'
    MONTHLY_SCENARIOS[21] = 'FESTIVAL_SURGE'
    
    MANUAL_INPUTS_CALENDAR = {
        5: {"Rake-12": {"health_penalty": 40, "reason": "Visual inspection"}},
        15: {"Rake-19": {"force_maintenance": True, "reason": "Driver report"}}
    }
    for day, override in manual_overrides.items():
        MANUAL_INPUTS_CALENDAR[int(day)] = override

    for day in range(start_day, SIMULATION_MONTH_DAYS + 1):
        scenario = MONTHLY_SCENARIOS[day - 1]
        manual_inputs_today = MANUAL_INPUTS_CALENDAR.get(day, {})
        
        fleet_df_processed = preprocess_and_health_score(fleet_df, day, manual_inputs_today)

        current_conditions = {
            'total_fleet_size': len(fleet_df_processed), 
            'target_service_trains': SCENARIO_MODIFIERS[scenario]['MIN_SERVICE'], 
            'avg_fleet_health': fleet_df_processed['health_score'].mean(), 
            'is_monsoon': 1 if scenario == 'HEAVY_MONSOON' else 0, 
            'is_surge': 1 if scenario == 'FESTIVAL_SURGE' else 0
        }
        conditions_df = pd.DataFrame([current_conditions])[feature_names]
        
        predicted_strategy = ai_model.predict(conditions_df)[0]
        dynamic_strategy = {
            'cost_per_km': predicted_strategy[0], 'fatigue_factor': predicted_strategy[1], 
            'branding_penalty': predicted_strategy[2], 'target_mileage': predicted_strategy[3], 
            'maint_threshold': predicted_strategy[4]
        }
        
        shap_explanations = []
        for i, estimator in enumerate(ai_model.estimators_):
            explainer = shap.TreeExplainer(estimator)
            shap_values = explainer.shap_values(conditions_df)
            
            # inside run_simulation, replacing the old shap explanation creation
            shap_values_raw = explainer.shap_values(conditions_df)

            # Convert to numpy and squeeze the leading batch axis if present
            sv = np.array(shap_values_raw)
            # If the explainer returned something with a leading batch dimension (1, ...), remove it
            if sv.ndim >= 2 and sv.shape[0] == 1:
                sv = np.squeeze(sv, axis=0)   # e.g. (1, n_features) -> (n_features,) or (1,n_features,n_classes)->(n_features,n_classes)

            # Convert expected value to numpy so we can reason about shapes
            ev = np.array(explainer.expected_value)

            # Now decide the canonical representation to store:
            # - For single-output: store scalar base_value and shap_values as a 1-D list of length n_features
            # - For multi-output: store base_value as list (length n_outputs) and shap_values as 2-D list shape (n_features, n_outputs)
            if sv.ndim == 1:
                # sv: (n_features,) -> single-output
                stored_shap = sv.tolist()
                # store base_value as scalar if possible
                if ev.shape == ():
                    stored_base = float(ev)
                elif ev.size == 1:
                    stored_base = float(ev.item())
                else:
                    # unexpected: ev is multi-element but sv is single-output -> coerce to list anyway
                    stored_base = ev.tolist()
            else:
                # sv.ndim >= 2, we expect (n_features, n_outputs)
                stored_shap = sv.tolist()
                stored_base = ev.tolist()

            explanation = {
                "output_name": targets[i],
                "base_value": stored_base,
                "shap_values": stored_shap,
            }
            shap_explanations.append(explanation)

        
        daily_plan, daily_cost = solve_daily_optimization(fleet_df_processed, day, scenario, dynamic_strategy)
        
        if daily_plan:
            fleet_status_before = fleet_df_processed.copy()
            fleet_status_before['cert_telecom_expiry'] = fleet_status_before['cert_telecom_expiry'].dt.strftime('%Y-m-%d')

            updated_df = apply_daily_updates(fleet_df_processed.copy(), daily_plan, day)
            fleet_status_after = updated_df.copy()
            fleet_status_after['cert_telecom_expiry'] = fleet_status_after['cert_telecom_expiry'].dt.strftime('%Y-m-%d')
            
            daily_log_entry = {
                "day": day,
                "scenario": scenario,
                "plan": daily_plan,
                "cost": daily_cost,
                "ai_strategy": dynamic_strategy,
                "fleet_status_before": fleet_status_before.to_dict(orient='records'),
                "fleet_status_after": fleet_status_after.to_dict(orient='records'),
                "shap_explanations": shap_explanations,
                "feature_names": feature_names,
                "feature_values": conditions_df.iloc[0].tolist()
            }
            monthly_log.append(daily_log_entry)
            
            fleet_df = updated_df
        else:
            print(f"CRITICAL FAILURE on Day {day}. Halting simulation.")
            break
            
    return monthly_log 