
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

//Vibe coded by ammaar@google.com

import { GoogleGenAI } from '@google/genai';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';

import { Artifact, Session, ComponentVariation, SavedArtifact } from './types';
import { INITIAL_PLACEHOLDERS } from './constants';
import { generateId } from './utils';

import DottedGlowBackground from './components/DottedGlowBackground';
import ArtifactCard from './components/ArtifactCard';
import SideDrawer from './components/SideDrawer';
import { 
    ThinkingIcon, 
    CodeIcon, 
    SparklesIcon, 
    ArrowLeftIcon, 
    ArrowRightIcon, 
    ArrowUpIcon, 
    GridIcon,
    CopyIcon,
    CheckIcon,
    SaveIcon,
    LibraryIcon,
    TrashIcon
} from './components/Icons';

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionIndex, setCurrentSessionIndex] = useState<number>(-1);
  const [focusedArtifactIndex, setFocusedArtifactIndex] = useState<number | null>(null);
  
  const [inputValue, setInputValue] = useState<string>('');
  const [refineValue, setRefineValue] = useState<string>('');
  const [isRefining, setIsRefining] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copyFeedback, setCopyFeedback] = useState<boolean>(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholders, setPlaceholders] = useState<string[]>(INITIAL_PLACEHOLDERS);
  
  // Library state
  const [savedLibrary, setSavedLibrary] = useState<SavedArtifact[]>(() => {
      const saved = localStorage.getItem('flash_ui_library');
      return saved ? JSON.parse(saved) : [];
  });

  const [drawerState, setDrawerState] = useState<{
      isOpen: boolean;
      mode: 'code' | 'variations' | 'library' | null;
      title: string;
      data: any; 
  }>({ isOpen: false, mode: null, title: '', data: null });

  const [componentVariations, setComponentVariations] = useState<ComponentVariation[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const refineRef = useRef<HTMLInputElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);

  // Persist library
  useEffect(() => {
      localStorage.setItem('flash_ui_library', JSON.stringify(savedLibrary));
  }, [savedLibrary]);

  useEffect(() => {
      inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (focusedArtifactIndex !== null && window.innerWidth <= 1024) {
        if (gridScrollRef.current) gridScrollRef.current.scrollTop = 0;
        window.scrollTo(0, 0);
    }
  }, [focusedArtifactIndex]);

  useEffect(() => {
      const interval = setInterval(() => {
          setPlaceholderIndex(prev => (prev + 1) % placeholders.length);
      }, 3000);
      return () => clearInterval(interval);
  }, [placeholders.length]);

  useEffect(() => {
      const fetchDynamicPlaceholders = async () => {
          try {
              const apiKey = process.env.API_KEY;
              if (!apiKey) return;
              const ai = new GoogleGenAI({ apiKey });
              const response = await ai.models.generateContent({
                  model: 'gemini-3-flash-preview',
                  contents: { 
                      role: 'user', 
                      parts: [{ 
                          text: 'Generate 20 creative, short, diverse UI component prompts (e.g. "bioluminescent task list"). Return ONLY a raw JSON array of strings. IP SAFEGUARD: Avoid referencing specific famous artists, movies, or brands.' 
                      }] 
                  }
              });
              const text = response.text || '[]';
              const jsonMatch = text.match(/\[[\s\S]*\]/);
              if (jsonMatch) {
                  const newPlaceholders = JSON.parse(jsonMatch[0]);
                  if (Array.isArray(newPlaceholders) && newPlaceholders.length > 0) {
                      const shuffled = newPlaceholders.sort(() => 0.5 - Math.random()).slice(0, 10);
                      setPlaceholders(prev => [...prev, ...shuffled]);
                  }
              }
          } catch (e) {
              console.warn("Silently failed to fetch dynamic placeholders", e);
          }
      };
      setTimeout(fetchDynamicPlaceholders, 1000);
  }, []);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
  };

  const handleRefineChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRefineValue(event.target.value);
  };

  const parseJsonStream = async function* (responseStream: AsyncGenerator<{ text: string }>) {
      let buffer = '';
      for await (const chunk of responseStream) {
          const text = chunk.text;
          if (typeof text !== 'string') continue;
          buffer += text;
          let braceCount = 0;
          let start = buffer.indexOf('{');
          while (start !== -1) {
              braceCount = 0;
              let end = -1;
              for (let i = start; i < buffer.length; i++) {
                  if (buffer[i] === '{') braceCount++;
                  else if (buffer[i] === '}') braceCount--;
                  if (braceCount === 0 && i > start) {
                      end = i;
                      break;
                  }
              }
              if (end !== -1) {
                  const jsonString = buffer.substring(start, end + 1);
                  try {
                      yield JSON.parse(jsonString);
                      buffer = buffer.substring(end + 1);
                      start = buffer.indexOf('{');
                  } catch (e) {
                      start = buffer.indexOf('{', start + 1);
                  }
              } else {
                  break; 
              }
          }
      }
  };

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  }, []);

  const handleSaveToLibrary = useCallback(() => {
      const currentSession = sessions[currentSessionIndex];
      if (!currentSession || focusedArtifactIndex === null) return;
      const artifact = currentSession.artifacts[focusedArtifactIndex];
      
      const name = window.prompt("Name this component:", artifact.styleName || "My Component");
      if (name === null) return; // Cancelled

      const savedItem: SavedArtifact = {
          ...artifact,
          id: generateId(),
          name: name || artifact.styleName,
          savedAt: Date.now(),
          originalPrompt: currentSession.prompt
      };
      
      setSavedLibrary(prev => [savedItem, ...prev]);
      alert("Saved to Library!");
  }, [sessions, currentSessionIndex, focusedArtifactIndex]);

  const handleLoadFromLibrary = (saved: SavedArtifact) => {
      const sessionId = generateId();
      const newSession: Session = {
          id: sessionId,
          prompt: saved.originalPrompt,
          timestamp: Date.now(),
          artifacts: [
              { ...saved, id: `${sessionId}_0`, status: 'complete' },
              { id: `${sessionId}_1`, styleName: 'Placeholder', html: '', status: 'error' },
              { id: `${sessionId}_2`, styleName: 'Placeholder', html: '', status: 'error' }
          ]
      };
      setSessions(prev => [...prev, newSession]);
      setCurrentSessionIndex(sessions.length);
      setFocusedArtifactIndex(0);
      setDrawerState(s => ({ ...s, isOpen: false }));
  };

  const handleDeleteFromLibrary = (id: string) => {
      if (confirm("Delete this from library?")) {
          setSavedLibrary(prev => prev.filter(item => item.id !== id));
      }
  };

  const handleGenerateVariations = useCallback(async () => {
    const currentSession = sessions[currentSessionIndex];
    if (!currentSession) return;
    
    setIsLoading(true);
    setComponentVariations([]);
    setDrawerState({ isOpen: true, mode: 'variations', title: 'Variations', data: currentSession.id });

    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) throw new Error("API_KEY is not configured.");
        const ai = new GoogleGenAI({ apiKey });

        const prompt = `
You are a master UI/UX designer. Generate 3 RADICAL CONCEPTUAL VARIATIONS of: "${currentSession.prompt}".

**STRICT IP SAFEGUARD:**
No names of artists. Describe the *Physicality* and *Material Logic* of the UI.

**YOUR TASK:**
For EACH variation:
- Invent a unique design persona name based on a NEW physical metaphor.
- Rewrite the prompt to fully adopt that metaphor's visual language.
- Generate high-fidelity HTML/CSS.

Required JSON Output Format (stream ONE object per line):
\`{ "name": "Persona Name", "html": "..." }\`
        `.trim();

        const responseStream = await ai.models.generateContentStream({
            model: 'gemini-3-flash-preview',
             contents: [{ parts: [{ text: prompt }], role: 'user' }],
             config: { temperature: 1.2 }
        });

        for await (const variation of parseJsonStream(responseStream)) {
            if (variation.name && variation.html) {
                setComponentVariations(prev => [...prev, variation]);
            }
        }
    } catch (e: any) {
        console.error("Error generating variations:", e);
    } finally {
        setIsLoading(false);
    }
  }, [sessions, currentSessionIndex]);

  const applyVariation = (html: string) => {
      if (focusedArtifactIndex === null) return;
      setSessions(prev => prev.map((sess, i) => 
          i === currentSessionIndex ? {
              ...sess,
              artifacts: sess.artifacts.map((art, j) => 
                j === focusedArtifactIndex ? { ...art, html, status: 'complete' } : art
              )
          } : sess
      ));
      setDrawerState(s => ({ ...s, isOpen: false }));
  };

  const applyAllVariations = () => {
    if (componentVariations.length < 3) return;
    setSessions(prev => prev.map((sess, i) => 
        i === currentSessionIndex ? {
            ...sess,
            artifacts: sess.artifacts.map((art, j) => ({
                ...art,
                styleName: componentVariations[j].name,
                html: componentVariations[j].html,
                status: 'complete'
            }))
        } : sess
    ));
    setDrawerState(s => ({ ...s, isOpen: false }));
  };

  const handleShowCode = () => {
      const currentSession = sessions[currentSessionIndex];
      if (currentSession && focusedArtifactIndex !== null) {
          const artifact = currentSession.artifacts[focusedArtifactIndex];
          setDrawerState({ isOpen: true, mode: 'code', title: 'Source Code', data: artifact.html });
      }
  };

  const handleOpenLibrary = () => {
      setDrawerState({ isOpen: true, mode: 'library', title: 'Saved Library', data: null });
  };

  const handleSendMessage = useCallback(async (manualPrompt?: string, isRefinement = false) => {
    const promptBase = isRefinement ? sessions[currentSessionIndex].prompt : (manualPrompt || inputValue);
    const refinement = refineValue.trim();
    const finalPrompt = isRefinement ? `${promptBase}. Addition instruction: ${refinement}` : promptBase.trim();
    
    if (!finalPrompt || isLoading) return;
    
    if (!isRefinement) {
        if (!manualPrompt) setInputValue('');
    } else {
        setRefineValue('');
        setIsRefining(false);
    }

    setIsLoading(true);
    const baseTime = Date.now();
    const sessionId = isRefinement ? sessions[currentSessionIndex].id : generateId();

    const placeholderArtifacts: Artifact[] = Array(3).fill(null).map((_, i) => ({
        id: `${sessionId}_${i}`,
        styleName: 'Designing...',
        html: '',
        status: 'streaming',
    }));

    if (isRefinement) {
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, prompt: finalPrompt, artifacts: placeholderArtifacts } : s));
    } else {
        const newSession: Session = {
            id: sessionId,
            prompt: finalPrompt,
            timestamp: baseTime,
            artifacts: placeholderArtifacts
        };
        setSessions(prev => [...prev, newSession]);
        setCurrentSessionIndex(sessions.length); 
    }
    
    setFocusedArtifactIndex(null); 

    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) throw new Error("API_KEY is not configured.");
        const ai = new GoogleGenAI({ apiKey });

        const stylePrompt = `
Generate 3 distinct, highly evocative design directions for: "${finalPrompt}".
Return ONLY a raw JSON array of 3 *NEW*, creative names for these directions (e.g. ["Tactile Risograph Press", "Kinetic Silhouette Balance", "Primary Pigment Gridwork"]).
        `.trim();

        const styleResponse = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { role: 'user', parts: [{ text: stylePrompt }] }
        });

        let generatedStyles: string[] = [];
        const styleText = styleResponse.text || '[]';
        const jsonMatch = styleText.match(/\[[\s\S]*\]/);
        
        if (jsonMatch) {
            try {
                generatedStyles = JSON.parse(jsonMatch[0]);
            } catch (e) {
                console.warn("Failed to parse styles, using fallbacks");
            }
        }

        if (!generatedStyles || generatedStyles.length < 3) {
            generatedStyles = ["Direction Alpha", "Direction Beta", "Direction Gamma"];
        }
        
        generatedStyles = generatedStyles.slice(0, 3);

        setSessions(prev => prev.map(s => {
            if (s.id !== sessionId) return s;
            return {
                ...s,
                artifacts: s.artifacts.map((art, i) => ({
                    ...art,
                    styleName: generatedStyles[i]
                }))
            };
        }));

        const generateArtifact = async (artifact: Artifact, styleInstruction: string) => {
            try {
                const prompt = `
You are Flash UI. Create a stunning UI component for: "${finalPrompt}".
CONCEPTUAL DIRECTION: ${styleInstruction}
Return ONLY RAW HTML. No markdown.
          `.trim();
          
                const responseStream = await ai.models.generateContentStream({
                    model: 'gemini-3-flash-preview',
                    contents: [{ parts: [{ text: prompt }], role: "user" }],
                });

                let accumulatedHtml = '';
                for await (const chunk of responseStream) {
                    const text = chunk.text;
                    if (typeof text === 'string') {
                        accumulatedHtml += text;
                        setSessions(prev => prev.map(sess => 
                            sess.id === sessionId ? {
                                ...sess,
                                artifacts: sess.artifacts.map(art => 
                                    art.id === artifact.id ? { ...art, html: accumulatedHtml } : art
                                )
                            } : sess
                        ));
                    }
                }
                
                let finalHtml = accumulatedHtml.trim();
                if (finalHtml.startsWith('```html')) finalHtml = finalHtml.substring(7).trimStart();
                if (finalHtml.startsWith('```')) finalHtml = finalHtml.substring(3).trimStart();
                if (finalHtml.endsWith('```')) finalHtml = finalHtml.substring(0, finalHtml.length - 3).trimEnd();

                setSessions(prev => prev.map(sess => 
                    sess.id === sessionId ? {
                        ...sess,
                        artifacts: sess.artifacts.map(art => 
                            art.id === artifact.id ? { ...art, html: finalHtml, status: finalHtml ? 'complete' : 'error' } : art
                        )
                    } : sess
                ));

            } catch (e: any) {
                setSessions(prev => prev.map(sess => 
                    sess.id === sessionId ? {
                        ...sess,
                        artifacts: sess.artifacts.map(art => 
                            art.id === artifact.id ? { ...art, html: `<div style="color: #ff6b6b; padding: 20px;">Error: ${e.message}</div>`, status: 'error' } : art
                        )
                    } : sess
                ));
            }
        };

        await Promise.all(placeholderArtifacts.map((art, i) => generateArtifact(art, generatedStyles[i])));

    } catch (e) {
        console.error("Fatal error", e);
    } finally {
        setIsLoading(false);
    }
  }, [inputValue, refineValue, isLoading, sessions, currentSessionIndex]);

  const handleSurpriseMe = () => {
      const currentPrompt = placeholders[placeholderIndex];
      setInputValue(currentPrompt);
      handleSendMessage(currentPrompt);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !isLoading) {
      event.preventDefault();
      handleSendMessage();
    } else if (event.key === 'Tab' && !inputValue && !isLoading) {
        event.preventDefault();
        setInputValue(placeholders[placeholderIndex]);
    }
  };

  const handleRefineKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !isLoading) {
        event.preventDefault();
        handleSendMessage(undefined, true);
    } else if (event.key === 'Escape') {
        setIsRefining(false);
    }
  };

  const nextItem = useCallback(() => {
      if (focusedArtifactIndex !== null) {
          if (focusedArtifactIndex < 2) setFocusedArtifactIndex(focusedArtifactIndex + 1);
      } else {
          if (currentSessionIndex < sessions.length - 1) setCurrentSessionIndex(currentSessionIndex + 1);
      }
  }, [currentSessionIndex, sessions.length, focusedArtifactIndex]);

  const prevItem = useCallback(() => {
      if (focusedArtifactIndex !== null) {
          if (focusedArtifactIndex > 0) setFocusedArtifactIndex(focusedArtifactIndex - 1);
      } else {
           if (currentSessionIndex > 0) setCurrentSessionIndex(currentSessionIndex - 1);
      }
  }, [currentSessionIndex, focusedArtifactIndex]);

  const isLoadingDrawer = isLoading && drawerState.mode === 'variations' && componentVariations.length === 0;
  const hasStarted = sessions.length > 0 || isLoading;
  const currentSession = sessions[currentSessionIndex];

  let canGoBack = false;
  let canGoForward = false;
  if (hasStarted) {
      if (focusedArtifactIndex !== null) {
          canGoBack = focusedArtifactIndex > 0;
          canGoForward = focusedArtifactIndex < (currentSession?.artifacts.length || 0) - 1;
      } else {
          canGoBack = currentSessionIndex > 0;
          canGoForward = currentSessionIndex < sessions.length - 1;
      }
  }

  return (
    <>
        <a href="https://x.com/ammaar" target="_blank" rel="noreferrer" className={`creator-credit ${hasStarted ? 'hide-on-mobile' : ''}`}>
            created by @ammaar
        </a>

        {!hasStarted && (
            <button className="top-library-btn" onClick={handleOpenLibrary}>
                <LibraryIcon /> Library ({savedLibrary.length})
            </button>
        )}

        <SideDrawer 
            isOpen={drawerState.isOpen} 
            onClose={() => setDrawerState(s => ({...s, isOpen: false}))} 
            title={drawerState.title}
        >
            {isLoadingDrawer && (
                 <div className="loading-state">
                     <ThinkingIcon /> 
                     Designing variations...
                 </div>
            )}

            {drawerState.mode === 'code' && (
                <div className="code-container">
                    <button className="copy-code-btn" onClick={() => handleCopy(drawerState.data)}>
                        {copyFeedback ? <CheckIcon /> : <CopyIcon />} {copyFeedback ? 'Copied' : 'Copy HTML'}
                    </button>
                    <pre className="code-block"><code>{drawerState.data}</code></pre>
                </div>
            )}
            
            {drawerState.mode === 'variations' && (
                <div className="sexy-grid">
                    {!isLoading && componentVariations.length >= 3 && (
                        <button className="apply-all-btn" onClick={applyAllVariations}>
                            Replace Current Grid with these
                        </button>
                    )}
                    {componentVariations.map((v, i) => (
                         <div key={i} className="sexy-card" onClick={() => applyVariation(v.html)}>
                             <div className="sexy-preview">
                                 <iframe srcDoc={v.html} title={v.name} sandbox="allow-scripts allow-same-origin" />
                             </div>
                             <div className="sexy-label">{v.name}</div>
                         </div>
                    ))}
                </div>
            )}

            {drawerState.mode === 'library' && (
                <div className="sexy-grid">
                    {savedLibrary.length === 0 && <p style={{ textAlign: 'center', opacity: 0.5 }}>Your library is empty.</p>}
                    {savedLibrary.map((item) => (
                         <div key={item.id} className="sexy-card library-card">
                             <div className="sexy-preview" onClick={() => handleLoadFromLibrary(item)}>
                                 <iframe srcDoc={item.html} title={item.name} sandbox="allow-scripts allow-same-origin" />
                             </div>
                             <div className="library-card-footer">
                                 <div className="sexy-label">{item.name}</div>
                                 <div className="library-actions">
                                     <button onClick={() => handleDeleteFromLibrary(item.id)} className="icon-btn trash"><TrashIcon /></button>
                                     <button onClick={() => handleLoadFromLibrary(item)} className="icon-btn load">Iterate</button>
                                 </div>
                             </div>
                         </div>
                    ))}
                </div>
            )}
        </SideDrawer>

        <div className="immersive-app">
            <DottedGlowBackground gap={24} radius={1.5} color="rgba(255, 255, 255, 0.02)" glowColor="rgba(255, 255, 255, 0.15)" speedScale={0.5} />

            <div className={`stage-container ${focusedArtifactIndex !== null ? 'mode-focus' : 'mode-split'}`}>
                 <div className={`empty-state ${hasStarted ? 'fade-out' : ''}`}>
                     <div className="empty-content">
                         <h1>Flash UI</h1>
                         <p>Creative UI generation in a flash</p>
                         <button className="surprise-button" onClick={handleSurpriseMe} disabled={isLoading}>
                             <SparklesIcon /> Surprise Me
                         </button>
                     </div>
                 </div>

                {sessions.map((session, sIndex) => {
                    let positionClass = 'hidden';
                    if (sIndex === currentSessionIndex) positionClass = 'active-session';
                    else if (sIndex < currentSessionIndex) positionClass = 'past-session';
                    else if (sIndex > currentSessionIndex) positionClass = 'future-session';
                    
                    return (
                        <div key={session.id} className={`session-group ${positionClass}`}>
                            <div className="artifact-grid" ref={sIndex === currentSessionIndex ? gridScrollRef : null}>
                                {session.artifacts.map((artifact, aIndex) => {
                                    const isFocused = focusedArtifactIndex === aIndex;
                                    return (
                                        <ArtifactCard 
                                            key={artifact.id}
                                            artifact={artifact}
                                            isFocused={isFocused}
                                            onClick={() => setFocusedArtifactIndex(aIndex)}
                                            onCopy={() => handleCopy(artifact.html)}
                                            copyFeedback={copyFeedback && isFocused}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

             {canGoBack && <button className="nav-handle left" onClick={prevItem}><ArrowLeftIcon /></button>}
             {canGoForward && <button className="nav-handle right" onClick={nextItem}><ArrowRightIcon /></button>}

            <div className={`action-bar ${focusedArtifactIndex !== null ? 'visible' : ''}`}>
                 <div className="active-prompt-label">
                    {currentSession?.prompt}
                 </div>
                 <div className="action-buttons">
                    {isRefining ? (
                        <div className="refine-input-group">
                            <input 
                                ref={refineRef}
                                type="text"
                                placeholder="Add more to prompt..."
                                value={refineValue}
                                onChange={handleRefineChange}
                                onKeyDown={handleRefineKeyDown}
                                autoFocus
                            />
                            <button onClick={() => handleSendMessage(undefined, true)} disabled={isLoading || !refineValue.trim()}>
                                {isLoading ? <ThinkingIcon /> : <ArrowUpIcon />}
                            </button>
                            <button onClick={() => setIsRefining(false)}>Cancel</button>
                        </div>
                    ) : (
                        <>
                            <button onClick={() => setFocusedArtifactIndex(null)}><GridIcon /> Grid View</button>
                            <button onClick={() => setIsRefining(true)}><SparklesIcon /> Refine</button>
                            <button onClick={handleGenerateVariations} disabled={isLoading}><SparklesIcon /> Variations</button>
                            <button onClick={handleShowCode}><CodeIcon /> Source</button>
                            <button onClick={handleSaveToLibrary}><SaveIcon /> Save to Library</button>
                            <button onClick={handleOpenLibrary}><LibraryIcon /> Library</button>
                            {focusedArtifactIndex !== null && (
                                <button onClick={() => handleCopy(currentSession?.artifacts[focusedArtifactIndex].html)}>
                                    {copyFeedback ? <CheckIcon /> : <CopyIcon />} {copyFeedback ? 'Copied' : 'Copy'}
                                </button>
                            )}
                        </>
                    )}
                 </div>
            </div>

            <div className={`floating-input-container ${focusedArtifactIndex !== null ? 'hidden' : ''}`}>
                <div className={`input-wrapper ${isLoading ? 'loading' : ''}`}>
                    {(!inputValue && !isLoading) && (
                        <div className="animated-placeholder" key={placeholderIndex}>
                            <span className="placeholder-text">{placeholders[placeholderIndex]}</span>
                            <span className="tab-hint">Tab</span>
                        </div>
                    )}
                    {!isLoading ? (
                        <input 
                            ref={inputRef}
                            type="text" 
                            value={inputValue} 
                            onChange={handleInputChange} 
                            onKeyDown={handleKeyDown} 
                            disabled={isLoading} 
                        />
                    ) : (
                        <div className="input-generating-label">
                            <span className="generating-prompt-text">{currentSession?.prompt}</span>
                            <ThinkingIcon />
                        </div>
                    )}
                    <button className="send-button" onClick={() => handleSendMessage()} disabled={isLoading || !inputValue.trim()}>
                        <ArrowUpIcon />
                    </button>
                </div>
            </div>
        </div>
    </>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<React.StrictMode><App /></React.StrictMode>);
}
