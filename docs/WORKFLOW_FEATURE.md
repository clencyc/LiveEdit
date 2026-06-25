# Workflow Editor Feature

## Overview
The Workflow Editor is a visual, drag-and-drop canvas for creating video editing workflows. Users can design process diagrams with different node types representing various editing operations, all controlled through an intuitive interface with voice command support.

## Features

### 1. **Visual Workflow Canvas**
- Built with React Flow for smooth drag-and-drop interactions
- Real-time node connections and edge management
- Auto-save functionality (stored in localStorage per project)
- Mini-map for easy navigation of large workflows
- Grid background with zoom and pan controls

### 2. **Node Types**

#### Upload Nodes (Rectangle - Blue)
Represent media uploads:
- **Video Upload**: Upload video files
- **Photo Upload**: Upload image files  
- **Audio Upload**: Upload audio files

#### Prompt Nodes (Parallelogram - Purple)
AI-powered transformations:
- **Transition**: Generate video transitions
- **Background**: Change/remove backgrounds
- **Filter**: Apply visual filters
- **Color Grade**: Adjust colors and grading

#### Start/Stop Nodes (Circle)
- **Start** (Green): Workflow entry point
- **Stop** (Red): Workflow endpoint

#### Process Nodes (Diamond - Orange)
- **Branch**: Create conditional logic and decision points

### 3. **Voice Control Integration**

#### Web Speech API
- Real-time voice-to-text transcription
- Live transcript display on canvas
- Command history tracking

#### Voice Commands
- `"add upload video"` - Add video upload node
- `"add upload photo"` - Add photo upload node  
- `"add upload audio"` - Add audio upload node
- `"add transition"` - Add transition effect node
- `"add background"` - Add background change node
- `"add filter"` - Add filter node
- `"add color grade"` - Add color grading node
- `"add stop"` - Add stop node
- `"clear all"` - Clear entire canvas

### 4. **Gemini Live API Integration**

#### Real-time AI Processing
- Interruptible audio generation
- Stream-based response handling
- Text-to-speech synthesis for AI responses
- Support for multimodal inputs (text + audio)

#### Key Features
- **Barge-in capability**: Users can interrupt AI mid-generation
- **Streaming responses**: Real-time text generation
- **Voice synthesis**: Convert AI text responses to speech
- **Error handling**: Graceful degradation on API failures

## Project Management

### Projects View
- Create multiple workflow projects
- Visual project cards with metadata
- Project deletion with confirmation
- Auto-saved timestamps (created/updated)

### Navigation
- **Sidebar**: Quick access to Projects from any view
- **Back button**: Return to Projects list from workflow
- **Project cards**: Click to open workflow editor

## Technical Implementation

### Components
- **ProjectsView.tsx**: Project management interface
- **WorkflowCanvas.tsx**: Main workflow editor with React Flow
- **WorkflowNodes.tsx**: Custom node type definitions
- **MediaSidebar.tsx**: Updated with Projects navigation

### Services  
- **geminiLive.ts**: Gemini Live API service with interruption support

### Storage
- Projects stored in localStorage: `projects_{userEmail}`
- Individual project data: `project_{projectId}`
- Contains nodes, edges, and metadata

### Dependencies
```json
{
  "@xyflow/react": "^12.3.2",
  "konva": "^9.3.6",
  "react-konva": "^18.2.10",
  "uuid": "^9.0.1"
}
```

## Usage Guide

### Creating a Project
1. Click "Projects" button in sidebar
2. Click "New Project" or the create card
3. Enter project name
4. Click "Create"

### Building a Workflow
1. Open a project from Projects view
2. Use toolbar on left to add nodes manually
3. OR activate voice control and speak commands
4. Connect nodes by dragging from output to input handles
5. Move nodes by dragging
6. Select nodes to highlight connections

### Voice Control
1. Click "Voice Control" button in header
2. Wait for "Listening..." indicator
3. Speak commands clearly
4. See live transcript at bottom
5. Click again to stop listening

### Interrupting AI
When using Gemini Live integration:
1. AI begins generating response
2. Click "Stop" or say "stop" to interrupt
3. Generation halts immediately
4. Start new command/generation

## Future Enhancements

- [ ] Node execution engine (run workflows)
- [ ] Export workflows as JSON
- [ ] Import existing workflows
- [ ] Collaborative editing (multi-user)
- [ ] Custom node templates
- [ ] Workflow validation/linting
- [ ] Performance metrics per node
- [ ] Undo/redo functionality
- [ ] Node grouping/subflows
- [ ] Real-time preview of transformations

## API Integration

### Gemini Live API Setup
```typescript
import { GeminiLiveService } from './services/geminiLive';

const service = new GeminiLiveService({
  apiKey: 'YOUR_API_KEY',
  onTextResponse: (text) => console.log(text),
  onAudioResponse: (audio) => playAudio(audio),
  onError: (error) => handleError(error),
  onInterrupted: () => console.log('Interrupted'),
});

await service.initialize();
await service.processTextCommand('Generate a transition effect');
service.interrupt(); // Stop generation
```

## Browser Compatibility

- **Voice Control**: Chrome, Edge (Web Speech API)
- **Canvas**: All modern browsers (React Flow)
- **Audio**: All browsers with Web Audio API support

## Performance Considerations

- Projects are stored locally (no backend required for MVP)
- Canvas renders efficiently with React Flow's virtualization
- Voice recognition runs client-side
- Gemini API calls are streamed for responsiveness

---

**Status**: ✅ Fully implemented with all core features
**Last Updated**: March 7, 2026
