import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

interface Project {
  id: string;
  name: string;
  thumbnail?: string;
  createdAt: number;
  updatedAt: number;
}

interface ProjectsViewProps {
  userEmail: string;
  onOpenProject: (projectId: string) => void;
  onBack: () => void;
}

const ProjectsView: React.FC<ProjectsViewProps> = ({ userEmail, onOpenProject, onBack }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  useEffect(() => {
    // Load projects from localStorage
    const savedProjects = localStorage.getItem(`projects_${userEmail}`);
    if (savedProjects) {
      setProjects(JSON.parse(savedProjects));
    }
  }, [userEmail]);

  const saveProjects = (updatedProjects: Project[]) => {
    localStorage.setItem(`projects_${userEmail}`, JSON.stringify(updatedProjects));
    setProjects(updatedProjects);
  };

  const createStarterWorkflow = (projectId: string) => {
    const startId = `start-${projectId}`;
    const uploadId = `upload-${projectId}`;
    const promptId = `prompt-${projectId}`;
    const stopId = `stop-${projectId}`;

    const starterNodes = [
      {
        id: startId,
        type: 'startStop',
        position: { x: 120, y: 140 },
        data: { label: 'Start', nodeType: 'start' },
      },
      {
        id: uploadId,
        type: 'upload',
        position: { x: 120, y: 290 },
        data: { label: 'Upload', fileType: 'Video', icon: 'fa-video' },
      },
      {
        id: promptId,
        type: 'prompt',
        position: { x: 430, y: 290 },
        data: {
          label: 'Prompt',
          action: 'Generate Transition',
          icon: 'fa-wand-magic-sparkles',
          prompt: 'Generate transitions, add background and apply color filter',
        },
      },
      {
        id: stopId,
        type: 'startStop',
        position: { x: 760, y: 290 },
        data: { label: 'Stop', nodeType: 'stop' },
      },
    ];

    const starterEdges = [
      { id: `e-${startId}-${uploadId}`, source: startId, target: uploadId, animated: true },
      { id: `e-${uploadId}-${promptId}`, source: uploadId, target: promptId, animated: true },
      { id: `e-${promptId}-${stopId}`, source: promptId, target: stopId, animated: true },
    ];

    localStorage.setItem(
      `project_${projectId}`,
      JSON.stringify({ nodes: starterNodes, edges: starterEdges, updatedAt: Date.now() })
    );
  };

  const handleCreateProject = () => {
    if (!newProjectName.trim()) return;

    const newProject: Project = {
      id: uuidv4(),
      name: newProjectName.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const updatedProjects = [newProject, ...projects];
    createStarterWorkflow(newProject.id);
    saveProjects(updatedProjects);
    setNewProjectName('');
    setIsCreatingProject(false);
    onOpenProject(newProject.id);
  };

  const handleDeleteProject = (projectId: string) => {
    if (window.confirm('Are you sure you want to delete this project?')) {
      const updatedProjects = projects.filter(p => p.id !== projectId);
      saveProjects(updatedProjects);
      localStorage.removeItem(`project_${projectId}`);
    }
  };

  return (
    <div className="h-full bg-[#0a0a0a] flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-neutral-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-[#00ff41] transition-all border border-neutral-800 hover:border-[#00ff41]"
            >
              <i className="fas fa-arrow-left mr-2"></i>
              Back
            </button>
            <h1 className="text-2xl font-bold text-white">Projects</h1>
          </div>
          <button
            onClick={() => setIsCreatingProject(true)}
            className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white bg-[#00ff41] hover:bg-[#00dd35] transition-all"
          >
            <i className="fas fa-plus mr-2"></i>
            New Project
          </button>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {/* Create Project Card */}
          {isCreatingProject && (
            <div className="aspect-video bg-neutral-900 border-2 border-dashed border-[#00ff41] rounded-lg p-4 flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 border-2 border-[#00ff41] rounded flex items-center justify-center">
                <i className="fas fa-plus text-2xl text-[#00ff41]"></i>
              </div>
              <input
                type="text"
                placeholder="Project Name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                autoFocus
                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 text-white text-sm rounded focus:outline-none focus:border-[#00ff41]"
              />
              <div className="flex gap-2 w-full">
                <button
                  onClick={handleCreateProject}
                  disabled={!newProjectName.trim()}
                  className="flex-1 px-3 py-1.5 text-[10px] font-bold uppercase bg-[#00ff41] text-black hover:bg-[#00dd35] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setIsCreatingProject(false);
                    setNewProjectName('');
                  }}
                  className="flex-1 px-3 py-1.5 text-[10px] font-bold uppercase bg-neutral-800 text-white hover:bg-neutral-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Project Cards */}
          {projects.map((project) => (
            <div
              key={project.id}
              className="group aspect-video bg-neutral-900 border border-neutral-800 hover:border-[#00ff41] rounded-lg overflow-hidden cursor-pointer transition-all relative"
              onClick={() => onOpenProject(project.id)}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 to-neutral-950 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-3 border-2 border-neutral-700 group-hover:border-[#00ff41] rounded flex items-center justify-center transition-all">
                    <i className="fas fa-diagram-project text-2xl text-neutral-700 group-hover:text-[#00ff41] transition-all"></i>
                  </div>
                  <h3 className="text-sm font-bold text-white px-4">{project.name}</h3>
                  <p className="text-[10px] text-neutral-500 mt-1">
                    Updated {new Date(project.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Hover Actions */}
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteProject(project.id);
                  }}
                  className="w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded flex items-center justify-center"
                >
                  <i className="fas fa-trash text-xs"></i>
                </button>
              </div>
            </div>
          ))}

          {/* Empty State */}
          {projects.length === 0 && !isCreatingProject && (
            <div className="col-span-full flex flex-col items-center justify-center py-20">
              <div className="w-24 h-24 border-2 border-dashed border-neutral-700 rounded-lg flex items-center justify-center mb-4">
                <i className="fas fa-folder-open text-4xl text-neutral-700"></i>
              </div>
              <h3 className="text-lg font-bold text-neutral-500 mb-2">No Projects Yet</h3>
              <p className="text-sm text-neutral-600 mb-6">Create your first workflow project to get started</p>
              <button
                onClick={() => setIsCreatingProject(true)}
                className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-white bg-[#00ff41] hover:bg-[#00dd35] transition-all"
              >
                <i className="fas fa-plus mr-2"></i>
                Create Project
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectsView;
