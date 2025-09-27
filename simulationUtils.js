import { useState, useEffect } from 'react';

// Constants
const API_BASE_URL = 'http://localhost:5000';

// Main simulation data loading function
export const loadSimulationData = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/run_full_simulation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('Simulation failed');
    }

    const result = await response.json();
    if (result.status === 'error') {
      throw new Error(result.message);
    }
    
    return result.data;
  } catch (error) {
    console.error('Failed to load simulation:', error);
    return [];
  }
};

// Rerun simulation from a specific day
export const rerunSimulation = async (startDay, overrides = {}) => {
  try {
    const response = await fetch(`${API_BASE_URL}/rerun_from_day`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        start_day: startDay,
        manual_overrides: overrides
      })
    });

    if (!response.ok) {
      throw new Error('Rerun failed');
    }

    const result = await response.json();
    if (result.status === 'error') {
      throw new Error(result.message);
    }

    return result.data;
  } catch (error) {
    console.error('Failed to rerun simulation:', error);
    return null;
  }
};

// Fetch XAI explanations from the backend
export const fetchExplanations = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/get_explanations`);
    if (!response.ok) {
      throw new Error('Failed to fetch explanations');
    }
    const result = await response.json();
    if (result.status === 'error') {
      throw new Error(result.message);
    }
    return result.data;
  } catch (error) {
    console.error('Error fetching explanations:', error);
    return [];
  }
};

// Transform raw fleet data for UI display
export const transformFleetData = (simulationData, selectedDay) => {
  const dayData = simulationData.find(d => d.day === selectedDay);
  if (!dayData) return [];

  return dayData.fleet_status_after.map(train => ({
    id: train.train_id,
    status: dayData.plan.SERVICE.includes(train.train_id) ? 'Service' :
            dayData.plan.MAINTENANCE.includes(train.train_id) ? 'Maintenance' : 'Standby',
    healthScore: Math.round(train.health_score),
    details: {
      fitnessCertificates: {
        status: train.is_cert_expired ? 'Expired' : 'Valid',
        expires: train.cert_telecom_expiry
      },
      jobCardStatus: {
        status: train.job_card_status,
        openJobs: train.job_card_status === 'OPEN' ? 1 : 0,
        details: train.job_card_priority
      },
      brandingPriority: {
        level: train.branding_sla_active ? 'High' : 'Normal',
        contract: train.branding_sla_active ? 'Active' : 'None',
        exposureNeeded: train.target_hours ? `${train.target_hours}h needed` : 'N/A'
      },
      mileageBalancing: {
        status: train.current_km > 55000 ? 'High' : 'Balanced',
        deviation: Math.abs(50000 - train.current_km),
        unit: 'km'
      },
      cleaningDetailing: {
        status: 'Clean',
        lastCleaned: train.last_cleaned_date
      },
      stablingGeometry: {
        bay: `Bay ${train.stabling_shunt_moves + 1}`,
        turnoutTime: `${train.stabling_shunt_moves * 5} min`
      }
    }
  }));
};

// Get summary statistics for the fleet
export const getFleetSummary = (simulationData, selectedDay) => {
  const dayData = simulationData.find(d => d.day === selectedDay);
  if (!dayData) return {
    total: 0,
    scenario: 'Unknown',
    inService: 0,
    inMaintenance: 0,
    onStandby: 0
  };

  const total = dayData.fleet_status_after.length;
  const inService = dayData.plan.SERVICE.length;
  const inMaintenance = dayData.plan.MAINTENANCE.length;
  
  return {
    total,
    scenario: dayData.scenario.replace('_', ' ').replace(/\w\S*/g, 
      txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    ),
    inService,
    inMaintenance,
    onStandby: total - inService - inMaintenance
  };
};

// Custom hook for simulation data management
export const useSimulation = () => {
  const [simulationData, setSimulationData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await loadSimulationData();
      setSimulationData(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const rerunFromDay = async (day, overrides) => {
    setLoading(true);
    try {
      const data = await rerunSimulation(day, overrides);
      if (data) {
        setSimulationData(data);
        setError(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return {
    simulationData,
    loading,
    error,
    loadData,
    rerunFromDay
  };
};