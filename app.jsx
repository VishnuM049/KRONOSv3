import React, { useState, useEffect } from 'react';
import { FileText, UserCircle, AlertTriangle, X, Menu, Calendar, MessageCircle, List, Zap, ShieldCheck,Wrench, Wind } from 'lucide-react';
import CalendarPicker from './CalendarPicker';
import ChatbotModal from './ChatbotModal';
import { transformFleetData, getFleetSummary, loadSimulationData } from './simulationUtils';

// --- Sub-Components ---

const Sidebar = ({ isOpen, onClose, onDatePrediction, onAllTrainsets, onExplainability }) => (
  <div className={`fixed inset-y-0 left-0 z-50 w-80 bg-gradient-to-b from-gray-800 to-gray-900 shadow-2xl border-r border-gray-600 transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
    <div className="p-6">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-xl font-bold text-transparent bg-gradient-to-r from-teal-400 to-lime-400 bg-clip-text">Menu</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
          <X size={24} />
        </button>
      </div>
      
      <div className="space-y-4">
        <button 
          onClick={onDatePrediction}
          className="w-full flex items-center gap-4 p-4 bg-gray-700/50 hover:bg-gray-700 rounded-xl transition-all duration-300 text-white hover:text-teal-300 group"
        >
          <Calendar size={20} className="text-teal-400 group-hover:text-teal-300" />
          <div className="text-left">
            <div className="font-semibold">Date Predictions</div>
            <div className="text-sm text-gray-400">View predictions for any date</div>
          </div>
        </button>
        
        <button 
          onClick={onAllTrainsets}
          className="w-full flex items-center gap-4 p-4 bg-gray-700/50 hover:bg-gray-700 rounded-xl transition-all duration-300 text-white hover:text-teal-300 group"
        >
          <List size={20} className="text-teal-400 group-hover:text-teal-300" />
          <div className="text-left">
            <div className="font-semibold">All Trainsets</div>
            <div className="text-sm text-gray-400">View all trainset health status</div>
          </div>
        </button>

        <button 
          onClick={onExplainability}
          className="w-full flex items-center gap-4 p-4 bg-gray-700/50 hover:bg-gray-700 rounded-xl transition-all duration-300 text-white hover:text-teal-300 group"
        >
          <FileText size={20} className="text-teal-400 group-hover:text-teal-300" />
          <div className="text-left">
            <div className="font-semibold">Explainability</div>
            <div className="text-sm text-gray-400">View AI explanations</div>
          </div>
        </button>
      </div>
    </div>
  </div>
);

const Header = ({ onMenuToggle }) => (
  <header className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 backdrop-blur-sm border-b border-gray-600 shadow-2xl sticky top-0 z-20">
    <div className="relative w-full h-20 flex items-center">
      {/* Left side icons - Fixed position */}
      <div className="absolute left-4 sm:left-6 lg:left-8 flex items-center space-x-3 z-10">
        <button 
          onClick={onMenuToggle}
          className="p-2 bg-teal-500/20 rounded-xl border border-teal-400/30 hover:bg-teal-500/30 transition-all duration-300"
        >
          <Menu size={24} className="text-teal-400" />
        </button>
        <div className="p-2 bg-teal-500/20 rounded-xl border border-teal-400/30">
          <UserCircle size={32} className="text-teal-400" />
        </div>
        <div className="hidden sm:block">
          <p className="text-sm text-gray-400">System Admin</p>
          <p className="text-xs text-gray-500">Operations Dashboard</p>
        </div>
      </div>
      
      {/* Center title - Absolutely centered */}
      <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
        <div className="text-center">
          <h1 className="text-4xl font-black text-transparent bg-gradient-to-r from-teal-400 via-cyan-400 to-lime-400 bg-clip-text tracking-widest">
            KRONOS
          </h1>
          <p className="text-xs text-gray-400 tracking-wider mt-1">TRAINSET OPTIMIZATION</p>
        </div>
      </div>
    </div>
  </header>
);

const HealthBar = ({ score }) => {
  const getGradient = (score) => {
    if (score > 80) return 'from-green-400 to-teal-500';
    if (score > 60) return 'from-yellow-400 to-orange-500';
    return 'from-red-500 to-pink-600';
  };

  return (
    <div className="relative">
      <div className="w-full bg-gray-700/50 rounded-full h-3 border border-gray-600/50">
        <div
          className={`bg-gradient-to-r ${getGradient(score)} h-full rounded-full transition-all duration-1000 ease-out shadow-lg`}
          style={{ width: `${score}%` }}
        >
        </div>
      </div>
    </div>
  );
};

const TrainCard = ({ train, onSelect }) => {
  const getStatusInfo = (status) => {
    switch (status) {
      case 'Service': return { color: 'green', icon: <Zap size={14} /> };
      case 'Maintenance': return { color: 'yellow', icon: <Wrench size={14} /> };
      case 'Standby': return { color: 'blue', icon: <ShieldCheck size={14} /> };
      default: return { color: 'gray', icon: <Wind size={14} /> };
    }
  };

  const statusInfo = getStatusInfo(train.status);
  const borderColor = `border-${statusInfo.color}-400/50`;
  const hoverBorderColor = `hover:border-${statusInfo.color}-400/70`;
  const shadowColor = `shadow-${statusInfo.color}-500/20`;
  const statusTextColor = `text-${statusInfo.color}-300`;
  const statusBgColor = `bg-${statusInfo.color}-500/20`;

  return (
    <div 
      className={`bg-gradient-to-br from-gray-800 to-gray-900 p-5 rounded-2xl border-2 ${borderColor} ${shadowColor} cursor-pointer ${hoverBorderColor} hover:bg-gray-800/80 transition-all duration-500 shadow-xl hover:shadow-lg transform hover:scale-[1.03] hover:-translate-y-1 group h-full flex flex-col justify-between w-full`}
      onClick={() => onSelect(train)}
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-2xl font-black text-white group-hover:text-teal-300 transition-colors duration-300">
            {train.id}
          </h3>
          {train.status && (
            <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium mt-2 border border-current ${statusTextColor} ${statusBgColor}`}>
              {statusInfo.icon}
              <span>{train.status}</span>
            </div>
          )}
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-white group-hover:text-teal-300 transition-colors duration-300">
            {train.healthScore}
          </p>
          <p className="text-sm text-gray-400">/100</p>
        </div>
      </div>
      
      <div className="mb-3">
        <HealthBar score={train.healthScore} />
      </div>
      
      <div className="flex justify-between items-center text-xs text-gray-500">
        <span>Health Score</span>
        <span className="group-hover:text-gray-400 transition-colors duration-300">
          Details →
        </span>
      </div>
    </div>
  );
};

const DetailItem = ({ label, value, statusColor }) => (
    <div className="bg-gradient-to-br from-gray-700 to-gray-800 p-4 rounded-xl border border-gray-600/50 hover:border-gray-500/70 transition-all duration-300 shadow-lg">
        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">{label}</p>
        <p className={`text-lg font-bold ${statusColor || 'text-white'}`}>{value}</p>
    </div>
);

const DatePredictionModal = ({ isOpen, onClose, onDateSelect, selectedDay }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-40 p-4" onClick={onClose}>
      <div 
        className="bg-gradient-to-br from-gray-800 via-gray-900 to-gray-800 rounded-3xl border-2 border-teal-400/50 w-full max-w-lg shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-transparent bg-gradient-to-r from-teal-400 to-lime-400 bg-clip-text">
            Select Simulation Day
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>
        
        <CalendarPicker 
          onDateSelect={onDateSelect}
          selectedDay={selectedDay}
        />
      </div>
    </div>
  );
};

const AllTrainsetsPage = ({ isOpen, onClose, trains }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 z-40 overflow-y-auto">
      <div className="min-h-screen">
        <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-gray-600 shadow-xl sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex justify-between items-center">
              <h1 className="text-3xl font-bold text-transparent bg-gradient-to-r from-teal-400 to-lime-400 bg-clip-text">
                All Trainsets Health Status
              </h1>
              <button 
                onClick={onClose}
                className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-xl transition-colors"
              >
                <X size={20} />
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
        
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-12">
          <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
            {trains.map((train) => (
              <div 
                key={train.id}
                className="flex-shrink-0 w-full sm:w-80 md:w-72 lg:w-64 xl:w-72 2xl:w-80"
              >
                <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-2xl border-2 border-blue-400/50 shadow-blue-500/20 shadow-xl h-full min-h-[200px] flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-xl sm:text-2xl font-bold text-white">{train.id}</h3>
                    <span className="text-lg sm:text-xl font-bold text-white">{train.healthScore}/100</span>
                  </div>
                  <div className="mb-4">
                    <HealthBar score={train.healthScore} />
                  </div>
                  <div className="text-sm text-gray-400 mt-auto">
                    Last updated: Today
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const TrainDetailModal = ({ train, onClose }) => {
  if (!train) return null;

  const { details } = train;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-30 p-4 animate-fadeIn" onClick={onClose}>
      <div 
        className="bg-gradient-to-br from-gray-800 via-gray-900 to-gray-800 rounded-3xl border-2 border-gray-600/50 w-full max-w-4xl shadow-2xl p-8 animate-slideUp relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-500/10 to-transparent rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-purple-500/10 to-transparent rounded-full blur-3xl"></div>
        
        <div className="relative z-10">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-4xl font-black text-transparent bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text mb-2">
                {train.id}
              </h2>
              <p className="text-gray-400 text-lg">Detailed Status Report</p>
            </div>
            <button 
              onClick={onClose} 
              className="text-gray-400 hover:text-white transition-all duration-300 p-3 hover:bg-gray-700/50 rounded-xl group"
            >
              <X size={28} className="group-hover:scale-110 transition-transform duration-300" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              <DetailItem label="Health Score" value={`${train.healthScore}/100`} statusColor={train.healthScore > 80 ? 'text-green-400' : train.healthScore > 60 ? 'text-yellow-400' : 'text-red-400'}/>
              <DetailItem label="Fitness Certificate" value={details.fitnessCertificates.status} statusColor={details.fitnessCertificates.status === 'Valid' ? 'text-green-400' : 'text-red-400'}/>
              <DetailItem label="Job Card" value={details.jobCardStatus.status} statusColor={details.jobCardStatus.status === 'Closed' ? 'text-green-400' : 'text-red-400'}/>
              <DetailItem label="Branding Priority" value={details.brandingPriority.level} statusColor={details.brandingPriority.level === 'High' ? 'text-blue-400' : 'text-gray-300'}/>
              <DetailItem label="Mileage" value={details.mileageBalancing.status} statusColor={details.mileageBalancing.status === 'Balanced' ? 'text-green-400' : 'text-yellow-400'}/>
              <DetailItem label="Cleaning" value={details.cleaningDetailing.status} statusColor={details.cleaningDetailing.status === 'Clean' ? 'text-green-400' : 'text-yellow-400'}/>
          </div>

          <div className="bg-gradient-to-r from-gray-900/80 via-gray-800/80 to-gray-900/80 p-6 rounded-2xl border border-gray-600/50 backdrop-blur-sm">
              <h4 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                <FileText size={20} className="text-blue-400" />
                Constraint Details
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300">
                  <div className="space-y-3">
                    <div><span className="font-bold text-blue-400">Cert Expires:</span> <span className="text-white">{details.fitnessCertificates.expires}</span></div>
                    <div><span className="font-bold text-blue-400">Open Jobs:</span> <span className="text-white">{details.jobCardStatus.openJobs}</span> {details.jobCardStatus.details ? `(${details.jobCardStatus.details})` : ''}</div>
                    <div><span className="font-bold text-blue-400">Branding Contract:</span> <span className="text-white">{details.brandingPriority.contract}</span> ({details.brandingPriority.exposureNeeded})</div>
                  </div>
                  <div className="space-y-3">
                    <div><span className="font-bold text-blue-400">Mileage Deviation:</span> <span className="text-white">{details.mileageBalancing.deviation} {details.mileageBalancing.unit}</span></div>
                    <div><span className="font-bold text-blue-400">Last Deep Clean:</span> <span className="text-white">{details.cleaningDetailing.lastCleaned}</span></div>
                    <div><span className="font-bold text-blue-400">Stabling Bay:</span> <span className="text-white">{details.stablingGeometry.bay}</span> (Turnout: {details.stablingGeometry.turnoutTime})</div>
                  </div>
              </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const FleetSection = ({ title, trains, onSelect, color }) => {
  if (trains.length === 0) return null;

  const statusInfo = {
    Service: { color: 'green', icon: <Zap /> },
    Maintenance: { color: 'yellow', icon: <Wrench /> },
    Standby: { color: 'blue', icon: <ShieldCheck /> },
  };

  const { icon } = statusInfo[title] || {};
  const textColor = `text-${color}-400`;

  return (
    <div>
      <h3 className={`text-2xl font-bold ${textColor} mb-4 flex items-center gap-3`}>
        {icon}
        {title} ({trains.length})
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
        {trains.map((train, index) => (
          <div 
            key={train.id}
            className="animate-slideInUp"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <TrainCard train={train} onSelect={onSelect} />
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Main App Component ---

export default function App() {
  const [fleet, setFleet] = useState([]);
  const [selectedTrain, setSelectedTrain] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showDatePrediction, setShowDatePrediction] = useState(false);
  const [showAllTrainsets, setShowAllTrainsets] = useState(false);
  const [showExplainability, setShowExplainability] = useState(false);
  const [simulationData, setSimulationData] = useState([]);
  const [selectedDay, setSelectedDay] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      const data = await loadSimulationData();
      setSimulationData(data);
      setLoading(false);
    };
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (simulationData.length > 0) {
      const newFleet = transformFleetData(simulationData, selectedDay);
      setFleet(newFleet);
    }
  }, [selectedDay, simulationData]);

  const handleDateSelect = (day) => {
    setSelectedDay(day);
    setShowDatePrediction(false);
  };

  const fleetSummary = getFleetSummary(simulationData, selectedDay);
  const serviceFleet = fleet.filter(t => t.status === 'Service');
  const maintenanceFleet = fleet.filter(t => t.status === 'Maintenance');
  const standbyFleet = fleet.filter(t => t.status === 'Standby');

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 min-h-screen font-sans text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-teal-400 mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold text-transparent bg-gradient-to-r from-teal-400 to-lime-400 bg-clip-text">
            Loading Fleet Data...
          </h2>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 min-h-screen font-sans text-white relative">
      <Header onMenuToggle={() => setSidebarOpen(true)} />
      
      <Sidebar 
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onDatePrediction={() => {
          setSidebarOpen(false);
          setShowDatePrediction(true);
        }}
        onAllTrainsets={() => {
          setSidebarOpen(false);
          setShowAllTrainsets(true);
        }}
        onExplainability={() => {
          setSidebarOpen(false);
          setShowExplainability(true);
        }}
      />

      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />}

      <main className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-12">
        <div className="text-center mb-12 space-y-4">
            <h2 className="text-3xl font-bold text-transparent bg-gradient-to-r from-teal-400 via-cyan-400 to-lime-400 bg-clip-text">
              Fleet Status for Day {selectedDay}
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              {fleetSummary.scenario} Scenario - {fleetSummary.total} trains operating.
            </p>
        </div>
        
        <div className="space-y-16">
          <FleetSection title="Service" trains={serviceFleet} onSelect={setSelectedTrain} color="green" />
          <FleetSection title="Maintenance" trains={maintenanceFleet} onSelect={setSelectedTrain} color="yellow" />
          <FleetSection title="Standby" trains={standbyFleet} onSelect={setSelectedTrain} color="blue" />
        </div>
        
        <div className="flex justify-center mt-16">
          <button className="flex items-center gap-3 bg-gradient-to-r from-red-700/80 to-red-800/80 text-white font-bold px-8 py-4 rounded-xl hover:from-red-600/90 hover:to-red-700/90 transition-all duration-300 shadow-lg hover:shadow-red-600/20 transform hover:scale-105 border border-red-600/30">
            <AlertTriangle size={20} />
            <span>Manual Override</span>
          </button>
        </div>
      </main>
      
      <TrainDetailModal train={selectedTrain} onClose={() => setSelectedTrain(null)} />
      <DatePredictionModal 
        isOpen={showDatePrediction} 
        onClose={() => setShowDatePrediction(false)}
        onDateSelect={handleDateSelect}
        selectedDay={selectedDay}
      />
      <AllTrainsetsPage isOpen={showAllTrainsets} onClose={() => setShowAllTrainsets(false)} trains={fleet} />
      <ExplainabilityModal 
        isOpen={showExplainability} 
        onClose={() => setShowExplainability(false)} 
        explanations={simulationData.map(d => d.shap_explanations)} 
      />

      <style jsx global>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(30px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes slideInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }
        .animate-slideUp { animation: slideUp 0.4s ease-out forwards; }
        .animate-slideInUp { animation: slideInUp 0.6s ease-out forwards; opacity: 0; }
      `}</style>
    </div>
  );
}