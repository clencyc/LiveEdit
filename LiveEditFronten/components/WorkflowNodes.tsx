import React, { useRef, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

interface NodeData {
  label?: string;
  fileType?: string;
  fileName?: string;
  icon?: string;
  nodeType?: string;
  action?: string;
  prompt?: string;
  videoFile?: File;
  videoUrl?: string;
  uploadPrompt?: string;
  [key: string]: any;
}

// Upload Node (Rectangle) - for videos, photos, audio
export const UploadNode: React.FC<NodeProps<NodeData>> = ({ data, selected }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localFile, setLocalFile] = useState<File | null>(data.videoFile || null);
  const [localPrompt, setLocalPrompt] = useState(data.uploadPrompt || '');
  const [showPrompt, setShowPrompt] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLocalFile(file);
      // Store in node data for workflow processing
      data.videoFile = file;
      data.fileName = file.name;
      data.videoUrl = URL.createObjectURL(file);
      setShowPrompt(true);
    }
  };

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setLocalPrompt(val);
    data.uploadPrompt = val;
  };

  return (
    <div className={`px-6 py-4 bg-blue-600 border-2 ${selected ? 'border-[#00ff41]' : 'border-blue-700'} rounded shadow-lg min-w-[200px] max-w-[280px]`}>
      <Handle 
        type="target" 
        position={Position.Top} 
        className="w-5 h-5 bg-white border-2 border-blue-700 hover:bg-[#00ff41] hover:border-[#00ff41] transition-all cursor-crosshair"
        style={{ top: -10 }}
      />
      
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 bg-blue-700 rounded flex items-center justify-center shrink-0">
          <i className={`fas ${data.icon || 'fa-upload'} text-white text-lg`}></i>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-bold text-sm uppercase tracking-wide">{data.label || 'Upload'}</div>
          <div className="text-blue-200 text-[10px] mt-0.5">{data.fileType || 'Media File'}</div>
        </div>
      </div>
      
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,image/*,audio/*"
        className="hidden"
        onChange={handleFileSelect}
      />
      
      {!localFile ? (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full px-3 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded transition-all"
        >
          <i className="fas fa-file-arrow-up mr-2"></i>
          Choose File
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-800 rounded text-[10px]">
            <i className="fas fa-check-circle text-green-400"></i>
            <span className="text-blue-100 truncate flex-1">{localFile.name}</span>
            <button
              onClick={() => {
                setLocalFile(null);
                data.videoFile = undefined;
                data.fileName = undefined;
                data.videoUrl = undefined;
                setShowPrompt(false);
              }}
              className="text-red-400 hover:text-red-300"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
          
          {showPrompt && (
            <textarea
              value={localPrompt}
              onChange={handlePromptChange}
              placeholder="What would you like to do with this video?"
              className="w-full h-20 px-2 py-1.5 bg-blue-800 border border-blue-700 rounded text-[10px] text-white placeholder-blue-300 resize-none focus:outline-none focus:border-[#00ff41]"
            />
          )}
        </div>
      )}
      
      <Handle 
        type="source" 
        position={Position.Bottom} 
        id="main"
        className="w-5 h-5 bg-white border-2 border-blue-700 hover:bg-[#00ff41] hover:border-[#00ff41] transition-all cursor-crosshair"
        style={{ bottom: -10 }}
        isConnectable={true}
      />
      <Handle 
        type="source" 
        position={Position.Right} 
        id="right"
        className="w-5 h-5 bg-white border-2 border-blue-700 hover:bg-[#00ff41] hover:border-[#00ff41] transition-all cursor-crosshair"
        isConnectable={true}
      />
    </div>
  );
};

// Start/Stop Node (Circle)
export const StartStopNode: React.FC<NodeProps<NodeData>> = ({ data, selected }) => {
  const isStart = data.nodeType === 'start';
  
  return (
    <div className={`relative ${selected ? 'ring-4 ring-[#00ff41]' : ''} rounded-full`}>
      {!isStart && (
        <Handle 
          type="target" 
          position={Position.Top} 
          className="w-5 h-5 bg-white border-2 border-red-700 hover:bg-[#00ff41] hover:border-[#00ff41] transition-all cursor-crosshair"
          style={{ top: -5 }}
        />
      )}
      
      <div className={`w-24 h-24 rounded-full ${isStart ? 'bg-green-600 border-4 border-green-700' : 'bg-red-600 border-4 border-red-700'} flex flex-col items-center justify-center shadow-xl`}>
        <i className={`fas ${isStart ? 'fa-play' : 'fa-stop'} text-white text-2xl mb-1`}></i>
        <span className="text-white font-bold text-[10px] uppercase tracking-wider">{data.label || (isStart ? 'Start' : 'Stop')}</span>
      </div>
      
      {isStart && (
        <Handle 
          type="source" 
          position={Position.Bottom} 
          className="w-5 h-5 bg-white border-2 border-green-700 hover:bg-[#00ff41] hover:border-[#00ff41] transition-all cursor-crosshair"
          style={{ bottom: -5 }}
        />
      )}
    </div>
  );
};

// Prompt Node (Parallelogram) - for transitions, backgrounds, colors, filters
export const PromptNode: React.FC<NodeProps<NodeData>> = ({ data, selected }) => {
  return (
    <div className="relative" style={{ minWidth: '180px' }}>
      <Handle 
        type="target" 
        position={Position.Top} 
        className="w-5 h-5 bg-white border-2 border-purple-700 hover:bg-[#00ff41] hover:border-[#00ff41] transition-all cursor-crosshair z-10"
        style={{ top: -10 }}
      />
      
      <div 
        className={`relative px-6 py-4 bg-purple-600 border-2 ${selected ? 'border-[#00ff41]' : 'border-purple-700'} shadow-lg`}
        style={{
          clipPath: 'polygon(10% 0%, 100% 0%, 90% 100%, 0% 100%)',
          minHeight: '60px'
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-purple-700 rounded flex items-center justify-center flex-shrink-0">
            <i className={`fas ${data.icon || 'fa-wand-magic-sparkles'} text-white text-sm`}></i>
          </div>
          <div className="flex-1">
            <div className="text-white font-bold text-xs uppercase tracking-wide">{data.label || 'Transform'}</div>
            <div className="text-purple-200 text-[9px] mt-0.5">{data.action || 'Apply Effect'}</div>
          </div>
        </div>
        
        {data.prompt && (
          <div className="mt-2 text-[9px] text-purple-100 line-clamp-2">
            {data.prompt}
          </div>
        )}
      </div>
      
      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="w-5 h-5 bg-white border-2 border-purple-700 hover:bg-[#00ff41] hover:border-[#00ff41] transition-all cursor-crosshair z-10"
        style={{ bottom: -10 }}
      />
    </div>
  );
};

// Process Node (Diamond) - for decision points
export const ProcessNode: React.FC<NodeProps<NodeData>> = ({ data, selected }) => {
  return (
    <div className="relative" style={{ width: '120px', height: '120px' }}>
      <Handle 
        type="target" 
        position={Position.Top} 
        className="w-5 h-5 bg-white border-2 border-orange-700 hover:bg-[#00ff41] hover:border-[#00ff41] transition-all cursor-crosshair z-10" 
        style={{ top: '5px' }} 
      />
      
      <div 
        className={`absolute inset-0 bg-orange-600 border-2 ${selected ? 'border-[#00ff41]' : 'border-orange-700'} shadow-lg flex items-center justify-center`}
        style={{
          clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
        }}
      >
        <div className="text-center px-2">
          <i className={`fas ${data.icon || 'fa-code-branch'} text-white text-lg mb-1`}></i>
          <div className="text-white font-bold text-[10px] uppercase">{data.label || 'Process'}</div>
        </div>
      </div>
      
      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="w-5 h-5 bg-white border-2 border-orange-700 hover:bg-[#00ff41] hover:border-[#00ff41] transition-all cursor-crosshair z-10" 
        style={{ bottom: '5px' }} 
      />
      <Handle 
        type="source" 
        position={Position.Right} 
        className="w-5 h-5 bg-white border-2 border-orange-700 hover:bg-[#00ff41] hover:border-[#00ff41] transition-all cursor-crosshair z-10" 
        id="right" 
      />
      <Handle 
        type="source" 
        position={Position.Left} 
        className="w-5 h-5 bg-white border-2 border-orange-700 hover:bg-[#00ff41] hover:border-[#00ff41] transition-all cursor-crosshair z-10" 
        id="left" 
      />
    </div>
  );
};

export const nodeTypes = {
  upload: UploadNode,
  startStop: StartStopNode,
  prompt: PromptNode,
  process: ProcessNode,
};
