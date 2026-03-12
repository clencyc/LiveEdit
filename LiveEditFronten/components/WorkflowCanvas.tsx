import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  ConnectionLineType,
  Edge,
  Node,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';
import { nodeTypes } from './WorkflowNodes';
import DirectorChatPanel from './DirectorChatPanel';
import type { Scene } from '../services/videoIngestion';

interface WorkflowCanvasProps {
  projectId: string;
  onBack: () => void;
}

interface VoiceCommand {
  command: string;
  timestamp: number;
}

interface DirectorMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

const buildStarterWorkflow = (projectId: string): { nodes: Node[]; edges: Edge[] } => {
  const startId = `start-${projectId}`;
  const uploadId = `upload-${projectId}`;
  const promptId = `prompt-${projectId}`;
  const stopId = `stop-${projectId}`;

  const nodes: Node[] = [
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
        prompt: 'Generate transitions, add backgrounds and apply filters',
      },
    },
    {
      id: stopId,
      type: 'startStop',
      position: { x: 760, y: 290 },
      data: { label: 'Stop', nodeType: 'stop' },
    },
  ];

  const edges: Edge[] = [
    { id: `e-${startId}-${uploadId}`, source: startId, target: uploadId, animated: true },
    { id: `e-${uploadId}-${promptId}`, source: uploadId, target: promptId, animated: true },
    { id: `e-${promptId}-${stopId}`, source: promptId, target: stopId, animated: true },
  ];

  return { nodes, edges };
};

const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({ projectId, onBack }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [promptInput, setPromptInput] = useState('');
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [showVideoIngestion, setShowVideoIngestion] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideos, setGeneratedVideos] = useState<Array<{id: string; url: string; name: string; timestamp: Date}>>([]);
  const [generationProgress, setGenerationProgress] = useState('');
  const [selectedDirectorNodeId, setSelectedDirectorNodeId] = useState('');
  const [directorPrompt, setDirectorPrompt] = useState('Keep the strongest highlights, preserve narrative flow, and prefer energetic moments.');
  const [directorBusy, setDirectorBusy] = useState(false);
  const [directorMessagesByNode, setDirectorMessagesByNode] = useState<Record<string, DirectorMessage[]>>({});
  const [directorThoughtByNode, setDirectorThoughtByNode] = useState<Record<string, string>>({});
  const [directorPlanMetaByNode, setDirectorPlanMetaByNode] = useState<Record<string, { selectedClipCount?: number; prunedSceneCount?: number; generatedAt?: string }>>({});
  const [recentCommands, setRecentCommands] = useState<VoiceCommand[]>([]);
  const [edgeType, setEdgeType] = useState<'default' | 'straight' | 'step' | 'smoothstep'>('default');
  const recognitionRef = useRef<any>(null);

  // Handle keyboard delete
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        setNodes((nds) => nds.filter((node) => !node.selected));
        setEdges((eds) => eds.filter((edge) => !edge.selected));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setNodes, setEdges]);

  // Load project data
  useEffect(() => {
    const savedProject = localStorage.getItem(`project_${projectId}`);
    if (!savedProject) {
      const starter = buildStarterWorkflow(projectId);
      setNodes(starter.nodes);
      setEdges(starter.edges);
      localStorage.setItem(`project_${projectId}`, JSON.stringify({ ...starter, updatedAt: Date.now() }));
      return;
    }

    try {
      const parsed = JSON.parse(savedProject);
      const savedNodes = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
      const savedEdges = Array.isArray(parsed?.edges) ? parsed.edges : [];

      const isBareLegacyProject =
        savedNodes.length === 1 &&
        savedEdges.length === 0 &&
        savedNodes[0]?.type === 'startStop' &&
        (savedNodes[0] as any)?.data?.nodeType === 'start';

      if (savedNodes.length === 0 || isBareLegacyProject) {
        const starter = buildStarterWorkflow(projectId);
        setNodes(starter.nodes);
        setEdges(starter.edges);
        localStorage.setItem(`project_${projectId}`, JSON.stringify({ ...starter, updatedAt: Date.now() }));
      } else {
        setNodes(savedNodes);
        setEdges(savedEdges);
      }
    } catch {
      const starter = buildStarterWorkflow(projectId);
      setNodes(starter.nodes);
      setEdges(starter.edges);
      localStorage.setItem(`project_${projectId}`, JSON.stringify({ ...starter, updatedAt: Date.now() }));
    }
  }, [projectId, setNodes, setEdges]);

  // Save project data
  useEffect(() => {
    if (nodes.length > 0 || edges.length > 0) {
      const projectData = { nodes, edges, updatedAt: Date.now() };
      localStorage.setItem(`project_${projectId}`, JSON.stringify(projectData));
    }
  }, [nodes, edges, projectId]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const edge = { ...connection, type: edgeType, animated: edgeType === 'default' };
      setEdges((eds) => addEdge(edge, eds));
    },
    [setEdges, edgeType]
  );

  // Allow multiple connections from the same source node
  const isValidConnection = useCallback((connection: any) => {
    // Get source and target nodes
    const sourceNode = nodes.find(n => n.id === connection.source);
    const targetNode = nodes.find(n => n.id === connection.target);
    
    // Prevent self-connections
    if (connection.source === connection.target) {
      return false;
    }
    
    // Allow multiple outputs from same node
    return true;
  }, [nodes]);

  const addNode = useCallback((type: string, data: any) => {
    const newNode: Node = {
      id: `${type}-${uuidv4()}`,
      type,
      position: { x: Math.random() * 400 + 200, y: Math.random() * 300 + 200 },
      data,
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  const updateNodeData = useCallback((nodeId: string, patch: Record<string, any>) => {
    setNodes((nds) => nds.map((node) => (
      node.id === nodeId
        ? { ...node, data: { ...node.data, ...patch } }
        : node
    )));
  }, [setNodes]);

  const getWorkflowPromptForUpload = useCallback((uploadNodeId: string) => {
    const uploadNode = nodes.find((n) => n.id === uploadNodeId);
    const connectedEdges = edges.filter((e) => e.source === uploadNodeId);
    const connectedPrompts = connectedEdges
      .map((edge) => nodes.find((n) => n.id === edge.target))
      .filter((node) => node?.type === 'prompt');

    return (
      uploadNode?.data?.uploadPrompt ||
      connectedPrompts.map((promptNode) => promptNode?.data?.prompt).filter(Boolean).join('\n')
    )?.trim() || 'Create an engaging highlight cut while preserving narrative clarity.';
  }, [nodes, edges]);

  const appendDirectorMessage = useCallback((nodeId: string, message: DirectorMessage) => {
    setDirectorMessagesByNode((prev) => ({
      ...prev,
      [nodeId]: [...(prev[nodeId] || []), message],
    }));
  }, []);

  const ensureDirectorSession = useCallback(async (uploadNode: any) => {
    const {
      uploadForIngestion,
      startDirectorSession,
    } = await import('../services/videoIngestion');

    let workingNode = uploadNode;

    if (!workingNode.data.geminiFileUri && workingNode.data.videoFile) {
      const result = await uploadForIngestion(workingNode.data.videoFile, {
        duration: 0,
        customPrompt: getWorkflowPromptForUpload(workingNode.id),
        onProgress: setGenerationProgress,
      });

      updateNodeData(workingNode.id, {
        geminiFileUri: result.gemini_file_uri,
        analysisResult: result.analysis,
        videoIntelligenceResult: result.video_intelligence,
        cacheName: result.cache_name || null,
      });

      workingNode = {
        ...workingNode,
        data: {
          ...workingNode.data,
          geminiFileUri: result.gemini_file_uri,
          analysisResult: result.analysis,
          videoIntelligenceResult: result.video_intelligence,
          cacheName: result.cache_name || null,
        },
      };
    }

    if (!workingNode.data.directorSessionId) {
      const session = await startDirectorSession({
        geminiFileUri: workingNode.data.geminiFileUri,
        cacheName: workingNode.data.cacheName || null,
        analysis: workingNode.data.analysisResult || {},
        videoIntelligence: workingNode.data.videoIntelligenceResult || {},
      });

      updateNodeData(workingNode.id, { directorSessionId: session.session_id });
      return session.session_id;
    }

    return workingNode.data.directorSessionId;
  }, [getWorkflowPromptForUpload, setGenerationProgress, updateNodeData]);

  const handleDirectorSend = useCallback(async () => {
    const selectedNode = nodes.find((node) => node.id === selectedDirectorNodeId && node.type === 'upload');
    if (!selectedNode || !directorPrompt.trim()) return;

    setDirectorBusy(true);
    try {
      setGenerationProgress('Director is reviewing your notes...');
      appendDirectorMessage(selectedNode.id, {
        role: 'user',
        content: directorPrompt.trim(),
        timestamp: Date.now(),
      });

      const { directorInteract } = await import('../services/videoIngestion');
      const sessionId = await ensureDirectorSession(selectedNode);
      const result = await directorInteract(sessionId, directorPrompt.trim());

      appendDirectorMessage(selectedNode.id, {
        role: 'assistant',
        content: result.assistant_response,
        timestamp: Date.now() + 1,
      });

      updateNodeData(selectedNode.id, { directorSessionId: sessionId, thoughtSignature: result.thought_signature || null });
      setDirectorThoughtByNode((prev) => ({
        ...prev,
        [selectedNode.id]: result.thought_signature || prev[selectedNode.id] || '',
      }));
      setDirectorPrompt('');
      setGenerationProgress('');
    } catch (error: any) {
      alert(`Director chat failed: ${error.message}`);
      setGenerationProgress('');
    } finally {
      setDirectorBusy(false);
    }
  }, [appendDirectorMessage, directorPrompt, ensureDirectorSession, nodes, selectedDirectorNodeId, updateNodeData]);

  const handleDirectorPlan = useCallback(async () => {
    const selectedNode = nodes.find((node) => node.id === selectedDirectorNodeId && node.type === 'upload');
    if (!selectedNode) return;

    setDirectorBusy(true);
    try {
      setGenerationProgress('Building structured edit plan...');
      const { generateDirectorPlan } = await import('../services/videoIngestion');
      const sessionId = await ensureDirectorSession(selectedNode);
      const brief = getWorkflowPromptForUpload(selectedNode.id);
      const result = await generateDirectorPlan(sessionId, brief, 30);

      updateNodeData(selectedNode.id, { directorPlan: result.plan, directorSessionId: sessionId });
      setDirectorPlanMetaByNode((prev) => ({
        ...prev,
        [selectedNode.id]: {
          selectedClipCount: result.plan?.selected_clips?.length || 0,
          prunedSceneCount: result.plan?.pruned_scenes?.length || 0,
          generatedAt: result.generated_at,
        },
      }));
      appendDirectorMessage(selectedNode.id, {
        role: 'assistant',
        content: `Plan ready: ${result.plan?.selected_clips?.length || 0} selected clips, ${result.plan?.pruned_scenes?.length || 0} pruned scenes.`,
        timestamp: Date.now(),
      });
      setGenerationProgress('');
    } catch (error: any) {
      alert(`Plan generation failed: ${error.message}`);
      setGenerationProgress('');
    } finally {
      setDirectorBusy(false);
    }
  }, [appendDirectorMessage, ensureDirectorSession, getWorkflowPromptForUpload, nodes, selectedDirectorNodeId, updateNodeData]);

  useEffect(() => {
    const uploadNodes = nodes.filter((node) => node.type === 'upload' && (node.data.videoFile || node.data.geminiFileUri));
    if (!uploadNodes.length) {
      if (selectedDirectorNodeId) setSelectedDirectorNodeId('');
      return;
    }

    if (!selectedDirectorNodeId || !uploadNodes.some((node) => node.id === selectedDirectorNodeId)) {
      setSelectedDirectorNodeId(uploadNodes[0].id);
    }
  }, [nodes, selectedDirectorNodeId]);

  // Voice Recognition Setup
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result) => result.transcript)
          .join('');
        
        setVoiceTranscript(transcript);
        
        // Process final results
        if (event.results[event.results.length - 1].isFinal) {
          processVoiceCommand(transcript);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsVoiceActive(false);
      };

      recognitionRef.current.onend = () => {
        if (isVoiceActive) {
          recognitionRef.current.start();
        }
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [isVoiceActive]);

  const toggleVoice = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in your browser.');
      return;
    }

    if (isVoiceActive) {
      recognitionRef.current.stop();
      setIsVoiceActive(false);
      setVoiceTranscript('');
    } else {
      recognitionRef.current.start();
      setIsVoiceActive(true);
    }
  };

  const processVoiceCommand = (command: string) => {
    const lowerCommand = command.toLowerCase();
    
    // Add to recent commands
    setRecentCommands(prev => [
      { command, timestamp: Date.now() },
      ...prev.slice(0, 4)
    ]);

    // Process commands
    if (lowerCommand.includes('add upload') || lowerCommand.includes('upload video') || lowerCommand.includes('upload photo')) {
      const fileType = lowerCommand.includes('video') ? 'Video' : lowerCommand.includes('photo') ? 'Photo' : 'Audio';
      addNode('upload', { 
        label: 'Upload', 
        fileType,
        icon: fileType === 'Video' ? 'fa-video' : fileType === 'Photo' ? 'fa-image' : 'fa-music'
      });
    } else if (lowerCommand.includes('add transition') || lowerCommand.includes('generate transition')) {
      addNode('prompt', { label: 'Transition', action: 'Generate Transition', icon: 'fa-film', prompt: command });
    } else if (lowerCommand.includes('add background') || lowerCommand.includes('change background')) {
      addNode('prompt', { label: 'Background', action: 'Change Background', icon: 'fa-panorama', prompt: command });
    } else if (lowerCommand.includes('add filter') || lowerCommand.includes('apply filter')) {
      addNode('prompt', { label: 'Filter', action: 'Apply Filter', icon: 'fa-filter', prompt: command });
    } else if (lowerCommand.includes('add color') || lowerCommand.includes('color grade')) {
      addNode('prompt', { label: 'Color Grade', action: 'Adjust Colors', icon: 'fa-palette', prompt: command });
    } else if (lowerCommand.includes('add stop') || lowerCommand.includes('end node')) {
      addNode('startStop', { label: 'Stop', nodeType: 'stop' });
    } else if (lowerCommand.includes('clear all') || lowerCommand.includes('delete all')) {
      setNodes([]);
      setEdges([]);
    }

    // Clear transcript after processing
    setTimeout(() => setVoiceTranscript(''), 2000);
  };

  const addNodeManual = (type: string) => {
    switch (type) {
      case 'upload-video':
        addNode('upload', { label: 'Upload', fileType: 'Video', icon: 'fa-video' });
        break;
      case 'upload-photo':
        addNode('upload', { label: 'Upload', fileType: 'Photo', icon: 'fa-image' });
        break;
      case 'upload-audio':
        addNode('upload', { label: 'Upload', fileType: 'Audio', icon: 'fa-music' });
        break;
      case 'prompt-transition':
        addNode('prompt', { label: 'Transition', action: 'Generate Transition', icon: 'fa-film' });
        break;
      case 'prompt-background':
        addNode('prompt', { label: 'Background', action: 'Change Background', icon: 'fa-panorama' });
        break;
      case 'prompt-filter':
        addNode('prompt', { label: 'Filter', action: 'Apply Filter', icon: 'fa-filter' });
        break;
      case 'prompt-color':
        addNode('prompt', { label: 'Color Grade', action: 'Adjust Colors', icon: 'fa-palette' });
        break;
      case 'stop':
        addNode('startStop', { label: 'Stop', nodeType: 'stop' });
        break;
      case 'process':
        addNode('process', { label: 'Branch', icon: 'fa-code-branch' });
        break;
    }
  };

  const handleInsertScenes = useCallback((scenes: Scene[]) => {
    const newNodes: Node[] = scenes.map((scene, i) => ({
      id: `scene-${uuidv4()}`,
      type: 'prompt',
      position: { x: 200 + i * 320, y: 450 },
      data: {
        label: `Scene ${scene.scene_number}`,
        action: scene.description?.slice(0, 40) || 'Scene',
        icon: 'fa-film',
        prompt: scene.description,
      },
    }));

    // Auto-connect scenes sequentially
    const newEdges: Edge[] = [];
    for (let i = 0; i < newNodes.length - 1; i++) {
      newEdges.push({
        id: `e-${newNodes[i].id}-${newNodes[i + 1].id}`,
        source: newNodes[i].id,
        target: newNodes[i + 1].id,
        animated: true,
        style: { stroke: '#00ff41', strokeWidth: 2 },
      });
    }

    setNodes((nds) => [...nds, ...newNodes]);
    setEdges((eds) => [...eds, ...newEdges]);
    setShowVideoIngestion(false);
  }, [setNodes, setEdges]);

  const handleCreateVideo = useCallback(async () => {
    setIsGenerating(true);
    setGenerationProgress('Analyzing workflow...');

    try {
      // Find all upload nodes with videos
      const uploadNodes = nodes.filter(n => n.type === 'upload' && n.data.videoFile);
      
      if (uploadNodes.length === 0) {
        alert('Please upload at least one video in an upload node');
        return;
      }

      // Find connected prompt nodes for each upload
      const workflowSteps = uploadNodes.map(uploadNode => {
        const connectedEdges = edges.filter(e => e.source === uploadNode.id);
        const connectedPrompts = connectedEdges
          .map(edge => nodes.find(n => n.id === edge.target))
          .filter(n => n?.type === 'prompt');
        
        return {
          uploadNode,
          prompts: connectedPrompts,
        };
      });

      // Process each workflow step
      for (const step of workflowSteps) {
        const { uploadNode, prompts } = step;
        const file = uploadNode.data.videoFile;
        const workflowPrompt = (
          uploadNode.data.uploadPrompt || prompts.map(p => p?.data.prompt).filter(Boolean).join('\n')
        )?.trim() || 'Create an engaging short highlight edit while preserving narrative clarity.';
        
        setGenerationProgress(`Processing ${file.name}...`);

        // Upload for ingestion
        const {
          uploadForIngestion,
          startDirectorSession,
          directorInteract,
          generateDirectorPlan,
          renderDirectorPlan,
        } = await import('../services/videoIngestion');
        
        const result = await uploadForIngestion(file, {
          duration: 0,
          customPrompt: workflowPrompt,
          onProgress: setGenerationProgress,
        });

        // Store gemini file URI in node for future queries
        uploadNode.data.geminiFileUri = result.gemini_file_uri;
        uploadNode.data.analysisResult = result.analysis;

        setGenerationProgress('Starting conversational director session...');
        const session = await startDirectorSession({
          geminiFileUri: result.gemini_file_uri,
          cacheName: result.cache_name || null,
          analysis: result.analysis || {},
          videoIntelligence: result.video_intelligence || {},
        });

        uploadNode.data.directorSessionId = session.session_id;

        setGenerationProgress('Applying workflow prompts...');
        await directorInteract(
          session.session_id,
          `Editing goal: ${workflowPrompt}\n\nReturn concise keep/discard decisions for scenes.`
        );

        setGenerationProgress('Generating structured edit plan...');
        const planResult = await generateDirectorPlan(
          session.session_id,
          workflowPrompt,
          30
        );

        uploadNode.data.directorPlan = planResult.plan;

        const selectedClips = planResult.plan?.selected_clips || [];
        if (!selectedClips.length) {
          setGenerationProgress('No clips selected by AI plan. Using original video preview.');
          const fallbackUrl = uploadNode.data.videoUrl || URL.createObjectURL(file);
          setGeneratedVideos(prev => [...prev, {
            id: `gen-${Date.now()}-${Math.random()}`,
            url: fallbackUrl,
            name: `Fallback_${file.name}`,
            timestamp: new Date(),
          }]);
          continue;
        }

        setGenerationProgress('Rendering final video...');
        const render = await renderDirectorPlan(file, planResult.plan as any);
        const finalUrl = render.download_url;

        setGeneratedVideos(prev => [...prev, {
          id: render.render_id || `gen-${Date.now()}-${Math.random()}`,
          url: finalUrl,
          name: `Edited_${file.name}`,
          timestamp: new Date(),
        }]);
      }

      setGenerationProgress('Complete!');
      setTimeout(() => setGenerationProgress(''), 2000);
    } catch (error: any) {
      alert(`Video generation failed: ${error.message}`);
      setGenerationProgress('');
    } finally {
      setIsGenerating(false);
    }
  }, [nodes, edges]);

  const handlePromptSubmit = () => {
    if (promptInput.trim()) {
      addNode('prompt', { 
        label: 'Custom Prompt', 
        action: 'Custom Action', 
        icon: 'fa-wand-magic-sparkles',
        prompt: promptInput.trim()
      });
      setPromptInput('');
    }
  };

  const directorUploadNodes = nodes.filter(
    (node) => node.type === 'upload' && (node.data.videoFile || node.data.geminiFileUri)
  );
  const selectedDirectorNode = directorUploadNodes.find((node) => node.id === selectedDirectorNodeId);
  const selectedDirectorMessages = directorMessagesByNode[selectedDirectorNodeId] || [];

  return (
    <div className="h-screen w-full bg-[#0a0a0a] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-14 border-b border-neutral-800 bg-[#111] flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-[#00ff41] transition-all border border-neutral-800 hover:border-[#00ff41]"
          >
            <i className="fas fa-arrow-left mr-2"></i>
            Projects
          </button>
          <div className="flex items-center gap-2">
            <i className="fas fa-diagram-project text-[#00ff41]"></i>
            <h2 className="text-sm font-bold text-white uppercase tracking-wide">Workflow Editor</h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Voice Control Button */}
          <button
            onClick={toggleVoice}
            className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all border ${
              isVoiceActive 
                ? 'bg-red-600 text-white border-red-700 animate-pulse' 
                : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-[#00ff41] hover:border-[#00ff41]'
            }`}
          >
            <i className={`fas ${isVoiceActive ? 'fa-microphone' : 'fa-microphone-slash'} mr-2`}></i>
            {isVoiceActive ? 'Listening...' : 'Voice Control'}
          </button>

          {/* Create Video Button */}
          <button
            onClick={handleCreateVideo}
            disabled={isGenerating}
            className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all border ${
              isGenerating
                ? 'bg-yellow-600 text-white border-yellow-700 cursor-wait'
                : 'bg-[#00ff41] text-black border-[#00ff41] hover:bg-[#00dd35]'
            }`}
          >
            {isGenerating ? (
              <>
                <i className="fas fa-spinner fa-spin mr-2"></i>
                Processing...
              </>
            ) : (
              <>
                <i className="fas fa-wand-magic-sparkles mr-2"></i>
                Create Video
              </>
            )}
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 border border-neutral-800 text-[10px] font-mono">
            <span className="text-neutral-500">Nodes:</span>
            <span className="text-[#00ff41]">{nodes.length}</span>
            <span className="text-neutral-700">|</span>
            <span className="text-neutral-500">Edges:</span>
            <span className="text-cyan-400">{edges.length}</span>
          </div>
        </div>
      </div>

      {/* Main Content Area (left sidebar + canvas) */}
      <div className="flex-1 flex min-h-0 overflow-hidden">

      {/* Left Sidebar - Generated Videos */}
      <div className="w-80 border-r border-neutral-800 bg-[#111] flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800 flex items-center gap-3">
          <i className="fas fa-film text-[#00ff41]"></i>
          <h3 className="text-sm font-bold uppercase tracking-wide text-white">Generated Videos</h3>
          <span className="ml-auto text-[9px] px-2 py-0.5 bg-[#00ff41]/20 text-[#00ff41] rounded-full uppercase tracking-wider font-bold">
            {generatedVideos.length}
          </span>
        </div>

        {generationProgress && (
          <div className="px-4 py-3 bg-yellow-600/20 border-b border-yellow-600/30">
            <div className="flex items-center gap-2 text-yellow-400 text-xs">
              <i className="fas fa-spinner fa-spin"></i>
              <span>{generationProgress}</span>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {generatedVideos.length === 0 ? (
            <div className="text-center py-12 text-neutral-600">
              <i className="fas fa-video text-4xl mb-3 block"></i>
              <p className="text-sm">No videos generated yet</p>
              <p className="text-[9px] mt-2 text-neutral-700">Upload videos in canvas nodes,<br/>then click "Create Video"</p>
            </div>
          ) : (
            generatedVideos.map(video => (
              <div key={video.id} className="bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden hover:border-neutral-700 transition-all">
                <video
                  src={video.url}
                  controls
                  className="w-full h-40 bg-black"
                />
                <div className="p-3">
                  <div className="text-white text-xs font-bold mb-1 truncate">{video.name}</div>
                  <div className="text-neutral-500 text-[9px]">
                    {video.timestamp.toLocaleTimeString()}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <a
                      href={video.url}
                      download={video.name}
                      className="flex-1 px-2 py-1 bg-[#00ff41] text-black text-[9px] font-bold uppercase rounded hover:bg-[#00dd35] text-center transition-all"
                    >
                      <i className="fas fa-download mr-1"></i> Download
                    </a>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(video.url);
                      }}
                      className="px-2 py-1 bg-neutral-800 text-neutral-400 text-[9px] font-bold uppercase rounded hover:bg-neutral-700 transition-all"
                    >
                      <i className="fas fa-copy"></i>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          nodeTypes={nodeTypes}
          fitView
          className="bg-[#0a0a0a]"
          style={{ width: '100%', height: '100%' }}
          connectionLineStyle={{ stroke: '#00ff41', strokeWidth: 3 }}
          connectionLineType={
            edgeType === 'straight'
              ? ConnectionLineType.Straight
              : edgeType === 'step'
              ? ConnectionLineType.Step
              : edgeType === 'smoothstep'
              ? ConnectionLineType.SmoothStep
              : ConnectionLineType.Bezier
          }
          defaultEdgeOptions={{
            animated: true,
            style: { stroke: '#00ff41', strokeWidth: 2 }
          }}
          onDrop={(event) => {
            event.preventDefault();
            const type = event.dataTransfer.getData('application/reactflow');
            if (type === 'customPrompt' && promptInput.trim()) {
              const reactFlowBounds = event.currentTarget.getBoundingClientRect();
              const position = {
                x: event.clientX - reactFlowBounds.left,
                y: event.clientY - reactFlowBounds.top,
              };
              const newNode: Node = {
                id: `prompt-${uuidv4()}`,
                type: 'prompt',
                position,
                data: {
                  label: 'Custom Prompt',
                  action: 'Custom Action',
                  icon: 'fa-wand-magic-sparkles',
                  prompt: promptInput.trim(),
                },
              };
              setNodes((nds) => [...nds, newNode]);
              setPromptInput('');
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
        >
          <Background color="#333" gap={16} />
          <Controls className="bg-neutral-900 border border-neutral-800" />
          <MiniMap 
            className="bg-neutral-900 border border-neutral-800" 
            nodeColor={(node) => {
              if (node.type === 'startStop') return node.data.nodeType === 'start' ? '#16a34a' : '#dc2626';
              if (node.type === 'upload') return '#2563eb';
              if (node.type === 'prompt') return '#9333ea';
              return '#ea580c';
            }}
          />

          {/* Toolbar Panel - Excalidraw Style */}
          <Panel position="top-left" className="bg-neutral-900/95 backdrop-blur border border-neutral-700 rounded-lg p-3 m-2 shadow-xl">
            <div className="grid grid-cols-2 gap-2">
              {/* Start Circle */}
              <button
                onClick={() => addNode('startStop', { label: 'Start', nodeType: 'start' })}
                className="group relative w-16 h-16 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-[#00ff41] rounded-lg flex items-center justify-center transition-all"
                title="Start Node (Circle)"
              >
                <div className="w-10 h-10 rounded-full border-2 border-green-500 flex items-center justify-center">
                  <i className="fas fa-play text-green-500 text-xs"></i>
                </div>
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  Start
                </div>
              </button>

              {/* Stop Circle */}
              <button
                onClick={() => addNode('startStop', { label: 'Stop', nodeType: 'stop' })}
                className="group relative w-16 h-16 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-[#00ff41] rounded-lg flex items-center justify-center transition-all"
                title="Stop Node (Circle)"
              >
                <div className="w-10 h-10 rounded-full border-2 border-red-500 flex items-center justify-center">
                  <i className="fas fa-stop text-red-500 text-xs"></i>
                </div>
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  Stop
                </div>
              </button>

              {/* Video Upload Rectangle */}
              <button
                onClick={() => addNodeManual('upload-video')}
                className="group relative w-16 h-16 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-[#00ff41] rounded-lg flex items-center justify-center transition-all"
                title="Video Upload (Rectangle)"
              >
                <div className="w-10 h-7 border-2 border-blue-500 rounded flex items-center justify-center">
                  <i className="fas fa-video text-blue-500 text-xs"></i>
                </div>
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  Video Upload
                </div>
              </button>

              {/* Photo Upload Rectangle */}
              <button
                onClick={() => addNodeManual('upload-photo')}
                className="group relative w-16 h-16 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-[#00ff41] rounded-lg flex items-center justify-center transition-all"
                title="Photo Upload (Rectangle)"
              >
                <div className="w-10 h-7 border-2 border-blue-500 rounded flex items-center justify-center">
                  <i className="fas fa-image text-blue-500 text-xs"></i>
                </div>
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  Photo Upload
                </div>
              </button>

              {/* Audio Upload Rectangle */}
              <button
                onClick={() => addNodeManual('upload-audio')}
                className="group relative w-16 h-16 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-[#00ff41] rounded-lg flex items-center justify-center transition-all"
                title="Audio Upload (Rectangle)"
              >
                <div className="w-10 h-7 border-2 border-blue-500 rounded flex items-center justify-center">
                  <i className="fas fa-music text-blue-500 text-xs"></i>
                </div>
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  Audio Upload
                </div>
              </button>

              {/* Transition Parallelogram */}
              <button
                onClick={() => addNodeManual('prompt-transition')}
                className="group relative w-16 h-16 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-[#00ff41] rounded-lg flex items-center justify-center transition-all"
                title="Transition (Parallelogram)"
              >
                <div className="relative w-10 h-7 flex items-center justify-center">
                  <div className="absolute inset-0 border-2 border-purple-500" style={{clipPath: 'polygon(15% 0%, 100% 0%, 85% 100%, 0% 100%)'}}></div>
                  <i className="fas fa-film text-purple-500 text-xs relative z-10"></i>
                </div>
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  Transition
                </div>
              </button>

              {/* Background Parallelogram */}
              <button
                onClick={() => addNodeManual('prompt-background')}
                className="group relative w-16 h-16 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-[#00ff41] rounded-lg flex items-center justify-center transition-all"
                title="Background (Parallelogram)"
              >
                <div className="relative w-10 h-7 flex items-center justify-center">
                  <div className="absolute inset-0 border-2 border-purple-500" style={{clipPath: 'polygon(15% 0%, 100% 0%, 85% 100%, 0% 100%)'}}></div>
                  <i className="fas fa-panorama text-purple-500 text-xs relative z-10"></i>
                </div>
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  Background
                </div>
              </button>

              {/* Filter Parallelogram */}
              <button
                onClick={() => addNodeManual('prompt-filter')}
                className="group relative w-16 h-16 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-[#00ff41] rounded-lg flex items-center justify-center transition-all"
                title="Filter (Parallelogram)"
              >
                <div className="relative w-10 h-7 flex items-center justify-center">
                  <div className="absolute inset-0 border-2 border-purple-500" style={{clipPath: 'polygon(15% 0%, 100% 0%, 85% 100%, 0% 100%)'}}></div>
                  <i className="fas fa-filter text-purple-500 text-xs relative z-10"></i>
                </div>
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  Filter
                </div>
              </button>

              {/* Color Parallelogram */}
              <button
                onClick={() => addNodeManual('prompt-color')}
                className="group relative w-16 h-16 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-[#00ff41] rounded-lg flex items-center justify-center transition-all"
                title="Color Grade (Parallelogram)"
              >
                <div className="relative w-10 h-7 flex items-center justify-center">
                  <div className="absolute inset-0 border-2 border-purple-500" style={{clipPath: 'polygon(15% 0%, 100% 0%, 85% 100%, 0% 100%)'}}></div>
                  <i className="fas fa-palette text-purple-500 text-xs relative z-10"></i>
                </div>
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  Color Grade
                </div>
              </button>

              {/* Branch Diamond */}
              <button
                onClick={() => addNodeManual('process')}
                className="group relative w-16 h-16 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-[#00ff41] rounded-lg flex items-center justify-center transition-all"
                title="Branch (Diamond)"
              >
                <div className="relative w-8 h-8 flex items-center justify-center">
                  <div className="absolute inset-0 border-2 border-orange-500 rotate-45"></div>
                  <i className="fas fa-code-branch text-orange-500 text-xs relative z-10"></i>
                </div>
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  Branch
                </div>
              </button>

            </div>
            
            {/* Arrow Style Selector */}
            <div className="mt-3 pt-3 border-t border-neutral-700">
              <div className="text-[8px] text-neutral-500 uppercase tracking-wider mb-2 text-center">Arrow Style</div>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => setEdgeType('default')} 
                  className={`group relative w-16 h-12 rounded flex items-center justify-center border transition-all ${
                    edgeType === 'default' 
                      ? 'bg-[#00ff41] text-black border-[#00ff41]' 
                      : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700 hover:border-[#00ff41]'
                  }`}
                >
                  <i className="fas fa-bezier-curve"></i>
                  <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    Bezier Curve
                  </div>
                </button>
                <button 
                  onClick={() => setEdgeType('straight')} 
                  className={`group relative w-16 h-12 rounded flex items-center justify-center border transition-all ${
                    edgeType === 'straight' 
                      ? 'bg-[#00ff41] text-black border-[#00ff41]' 
                      : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700 hover:border-[#00ff41]'
                  }`}
                >
                  <i className="fas fa-minus"></i>
                  <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    Straight Line
                  </div>
                </button>
                <button 
                  onClick={() => setEdgeType('step')} 
                  className={`group relative w-16 h-12 rounded flex items-center justify-center border transition-all ${
                    edgeType === 'step' 
                      ? 'bg-[#00ff41] text-black border-[#00ff41]' 
                      : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700 hover:border-[#00ff41]'
                  }`}
                >
                  <i className="fas fa-stairs"></i>
                  <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    Step
                  </div>
                </button>
                <button 
                  onClick={() => setEdgeType('smoothstep')} 
                  className={`group relative w-16 h-12 rounded flex items-center justify-center border transition-all ${
                    edgeType === 'smoothstep' 
                      ? 'bg-[#00ff41] text-black border-[#00ff41]' 
                      : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700 hover:border-[#00ff41]'
                  }`}
                >
                  <i className="fas fa-wave-square"></i>
                  <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    Smooth Step
                  </div>
                </button>
              </div>
            </div>
          </Panel>

          {/* Custom Prompt Toggle Button */}
          <Panel position="bottom-left" className="bg-neutral-900/95 backdrop-blur border border-neutral-700 rounded-lg p-3 m-2 shadow-xl w-[145px]">
            <button
              onClick={() => setShowPromptInput(!showPromptInput)}
              className={`w-full px-3 py-4 rounded-lg transition-all relative group ${
                showPromptInput 
                  ? 'bg-[#00ff41] border-2 border-[#00ff41]'
                  : 'bg-gradient-to-br from-purple-600 to-purple-700 border-2 border-purple-500 hover:border-[#00ff41]'
              }`}
            >
              <div className="text-center">
                <i className={`fas fa-pen-to-square text-xl mb-1.5 block ${
                  showPromptInput ? 'text-black' : 'text-white'
                }`}></i>
                <div className={`text-[8px] font-bold uppercase tracking-wider ${
                  showPromptInput ? 'text-black' : 'text-white'
                }`}>
                  {showPromptInput ? 'Close Prompt' : 'Custom Prompt'}
                </div>
              </div>
            </button>
          </Panel>

          {/* Custom Prompt Input Panel (Conditional) */}
          {showPromptInput && (
            <Panel position="bottom-left" className="bg-neutral-900/95 backdrop-blur border border-neutral-700 rounded-lg p-4 m-2 mb-28 shadow-xl w-80">
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-pen-to-square text-[#00ff41]"></i>
                    <div className="text-xs font-bold text-white uppercase tracking-wide">Custom Prompt</div>
                  </div>
                  <button
                    onClick={() => setShowPromptInput(false)}
                    className="text-neutral-500 hover:text-[#00ff41] transition-colors"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                </div>
                
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('application/reactflow', 'customPrompt');
                  }}
                  className="w-full px-4 py-8 bg-gradient-to-br from-purple-600 to-purple-700 border-2 border-purple-500 rounded-lg cursor-move hover:border-[#00ff41] transition-all shadow-lg relative group"
                >
                  <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"></div>
                  <div className="relative z-10 text-center">
                    <i className="fas fa-wand-magic-sparkles text-white text-2xl mb-2 block"></i>
                    <div className="text-white text-xs font-bold uppercase tracking-wider">Drag to Canvas</div>
                    <div className="text-purple-200 text-[9px] mt-1">Drop anywhere on workflow</div>
                  </div>
                </div>

                <textarea
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder="Describe your workflow step..."
                  className="w-full h-24 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm text-white placeholder-neutral-500 resize-none focus:outline-none focus:border-[#00ff41] focus:ring-1 focus:ring-[#00ff41]"
                />
                
                <div className="text-[9px] text-neutral-500 text-center leading-tight">
                  Type your custom prompt above, then drag the box onto the canvas to add it to your workflow
                </div>
              </div>
            </Panel>
          )}

          {/* Voice Transcript Panel */}
          {isVoiceActive && (
            <Panel position="bottom-center" className="bg-neutral-900 border-2 border-[#00ff41] rounded-lg p-3 m-2 min-w-[300px]">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>
                <div className="text-[9px] text-neutral-400 uppercase tracking-widest font-bold">Live Transcript</div>
              </div>
              <div className="text-sm text-white min-h-[40px]">
                {voiceTranscript || 'Say "add upload video" or "add transition"...'}
              </div>
              {recentCommands.length > 0 && (
                <div className="mt-2 pt-2 border-t border-neutral-800">
                  <div className="text-[8px] text-neutral-500 uppercase mb-1">Recent</div>
                  {recentCommands.map((cmd, i) => (
                    <div key={i} className="text-[9px] text-neutral-600 truncate">• {cmd.command}</div>
                  ))}
                </div>
              )}
            </Panel>
          )}
        </ReactFlow>
      </div>

      <DirectorChatPanel
        uploads={directorUploadNodes.map((node) => ({
          id: node.id,
          label: String(node.data.label || 'Upload'),
          fileName: String(node.data.fileName || node.data.geminiFileUri || node.id),
          hasSession: Boolean(node.data.directorSessionId),
        }))}
        selectedUploadId={selectedDirectorNodeId}
        onSelectUpload={setSelectedDirectorNodeId}
        messages={selectedDirectorMessages}
        prompt={directorPrompt}
        onPromptChange={setDirectorPrompt}
        onSend={handleDirectorSend}
        onGeneratePlan={handleDirectorPlan}
        thoughtSignature={selectedDirectorNode ? directorThoughtByNode[selectedDirectorNode.id] || selectedDirectorNode.data.thoughtSignature : ''}
        latestPlan={selectedDirectorNode ? directorPlanMetaByNode[selectedDirectorNode.id] : undefined}
        busy={directorBusy}
      />

      </div>{/* end flex row */}
    </div>
  );
};

export default WorkflowCanvas;
