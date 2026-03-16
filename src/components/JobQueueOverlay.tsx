import React, { useState, useEffect } from 'react';

interface Job {
  id: string;
  type: string;
  status: string;
  label: string;
  progress: number;
}

interface JobQueueOverlayProps {
  open?: boolean;
  onClose?: () => void;
}

const JobQueueOverlay: React.FC<JobQueueOverlayProps> = ({ open, onClose }) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [internalOpen, setInternalOpen] = useState(false);

  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = (val: boolean) => {
    if (onClose && !val) onClose();
    setInternalOpen(val);
  };

  useEffect(() => {
    const poll = async () => {
      try {
        const [batchRes, composeRes] = await Promise.all([
          fetch('/api/media/batch/status'),
          fetch('/api/media/compose/status')
        ]);
        const batch = await batchRes.json();
        const compose = await composeRes.json();
        
        // Remove completed jobs after a few seconds or filtering
        setJobs([...batch, ...compose]);
      } catch (err) {
        console.error('Failed to poll jobs', err);
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, []);

  const activeJobs = jobs.filter(j => j.status === 'processing' || j.status === 'pending');
  if (activeJobs.length === 0 && !isOpen) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Floating Pill */}
      {!isOpen && activeJobs.length > 0 && (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center space-x-2 hover:bg-indigo-700 transition-all animate-bounce"
        >
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-sm font-medium">{activeJobs.length} active jobs...</span>
        </button>
      )}

      {/* Expanded List */}
      {isOpen && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-80 max-h-96 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
            <h3 className="font-bold text-gray-900 dark:text-white">Active Pipeline</h3>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600">×</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {jobs.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No recent jobs</p>
            ) : (
              jobs.map(job => (
                <div key={job.id} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-gray-700 dark:text-gray-300 truncate w-40">{job.label}</span>
                    <span className="text-gray-500 uppercase">{job.status}</span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-indigo-500 h-full transition-all duration-500" 
                      style={{ width: `${job.progress || (job.status === 'done' ? 100 : 30)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default JobQueueOverlay;
