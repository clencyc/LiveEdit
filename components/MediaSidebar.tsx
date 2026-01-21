
import React, { useRef } from 'react';
import { MediaAsset } from '../types';

interface MediaSidebarProps {
  isOpen: boolean;
  assets: MediaAsset[];
  onAddAsset: (asset: MediaAsset) => void;
}

const MediaSidebar: React.FC<MediaSidebarProps> = ({ isOpen, assets, onAddAsset }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    (Array.from(files) as File[]).forEach(file => {
      const url = URL.createObjectURL(file);
      onAddAsset({
        id: Math.random().toString(36).substr(2, 9),
        url: url,
        name: file.name,
        type: 'upload',
        mimeType: file.type,
        timestamp: Date.now()
      });
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploads = assets.filter(a => a.type === 'upload');
  const generations = assets.filter(a => a.type === 'generation');

  if (!isOpen) return null;

  return (
    <aside className="w-64 border-r border-neutral-800 bg-[#111] flex flex-col z-40 h-full shrink-0">
      <div className="p-3 border-b border-neutral-800 flex items-center justify-between">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">Master Bin</h2>
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="w-6 h-6 border border-neutral-700 text-neutral-400 hover:text-[#00ff41] hover:border-[#00ff41] flex items-center justify-center transition-all text-xs"
        >
          <i className="fas fa-plus"></i>
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileUpload} 
          className="hidden" 
          multiple 
          accept="video/*,image/*" 
        />
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 p-3 custom-scrollbar">
        <section>
          <div className="flex items-center gap-2 mb-2">
            <i className="fas fa-film text-[10px] text-[#00ff41]"></i>
            <h3 className="text-[9px] font-bold text-neutral-600 uppercase tracking-widest">Generations</h3>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {generations.length === 0 ? (
              <div className="col-span-2 aspect-video border border-dashed border-neutral-800 rounded flex flex-col items-center justify-center text-[8px] text-neutral-700">
                Empty Bin
              </div>
            ) : (
              generations.map(asset => (
                <AssetItem key={asset.id} asset={asset} />
              ))
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-2">
            <i className="fas fa-cloud-upload text-[10px] text-cyan-500"></i>
            <h3 className="text-[9px] font-bold text-neutral-600 uppercase tracking-widest">Uploads</h3>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {uploads.length === 0 ? (
              <div className="col-span-2 aspect-video border border-dashed border-neutral-800 rounded flex flex-col items-center justify-center text-[8px] text-neutral-700">
                Import Files
              </div>
            ) : (
              uploads.map(asset => (
                <AssetItem key={asset.id} asset={asset} />
              ))
            )}
          </div>
        </section>
      </div>
    </aside>
  );
};

const AssetItem: React.FC<{ asset: MediaAsset }> = ({ asset }) => {
  const isVideo = asset.mimeType.startsWith('video');
  
  return (
    <div className="group relative aspect-video bg-neutral-900 border border-neutral-800 hover:border-[#00ff41] transition-all cursor-pointer overflow-hidden shadow-2xl">
      {isVideo ? (
        <video src={asset.url} className="w-full h-full object-cover" />
      ) : (
        <img src={asset.url} className="w-full h-full object-cover" />
      )}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <a 
          href={asset.url} 
          download={asset.name}
          className="text-[10px] text-white uppercase font-bold tracking-tighter hover:text-[#00ff41]"
          onClick={e => e.stopPropagation()}
        >
          Export
        </a>
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-black/80 p-1">
        <p className="text-[7px] text-neutral-400 truncate font-mono uppercase">{asset.name}</p>
      </div>
    </div>
  );
};

export default MediaSidebar;
