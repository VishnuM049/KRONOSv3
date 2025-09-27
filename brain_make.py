import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.multioutput import MultiOutputRegressor
import joblib

# --- 1. Configuration ---
HISTORICAL_DATA_FILE = "historical_data_retrain.csv"
MODEL_OUTPUT_FILE = "strategy_model.joblib"

# --- 2. Load and Prepare Data ---
print(f"Loading historical strategy data from '{HISTORICAL_DATA_FILE}'...")
try:
    df = pd.read_csv(HISTORICAL_DATA_FILE)
except FileNotFoundError:
    print(f"Error: '{HISTORICAL_DATA_FILE}' not found. Please ensure the file exists.")
    exit()

# Filter for successful strategies to learn from the best outcomes
df_successful = df[df['success_score'] > 80].copy()
print(f"Filtered for successful strategies: {len(df_successful)} data points.")

# Define the features (inputs) and the targets (multiple outputs)
features = [
    'total_fleet_size',
    'target_service_trains',
    'avg_fleet_health',
    'is_monsoon',
    'is_surge'
]
# The model will now predict all 5 of these strategic parameters
targets = [
    'historical_cost_per_km',
    'historical_fatigue_factor',
    'historical_branding_penalty',
    'historical_target_mileage',
    'historical_maint_threshold'
]

X = df_successful[features]
y = df_successful[targets]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# --- 3. Train the AI "Strategist" Model ---
print("\nTraining the AI Strategist model to predict 5 strategic parameters...")

# The MultiOutputRegressor is perfect for this task
base_model = RandomForestRegressor(n_estimators=100, random_state=42)
multi_output_model = MultiOutputRegressor(estimator=base_model)

multi_output_model.fit(X_train, y_train)
print("AI Strategist training complete.")

# --- 4. Save the Trained Model ---
print(f"\nSaving the trained strategist model to '{MODEL_OUTPUT_FILE}'...")
joblib.dump(multi_output_model, MODEL_OUTPUT_FILE)
print("Model saved successfully.")