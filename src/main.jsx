import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Music2, Sparkles, Library, SlidersHorizontal, Save, Mic2, Drum, Waves, Piano, Lock, ChevronDown, Loader2, AlertCircle } from 'lucide-react';
import './styles.css';

const genres = ['Trap', 'Pop', 'EDM', 'RnB'];
const moods = ['Energético', 'Melancólico', 'Sombrio', 'Romântico', 'Inspirador'];
const languages = ['Português', 'Inglês', 'Espanhol'];

function App() {
  const [genre, setGenre] = useState('Trap');
  const [language, setLanguage] = useState('Português');
  const [mood, setMood] = useState('Energético');
  const [idea, setIdea] = useState('Superação depois de um término, luzes da cidade à noite...');
  const [energy, setEnergy] = useState(70);
  const [generated, setGenerated] = useState(null);
  const [activeTab, setActiveTab] = useState('lyrics');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fallbackMeta = useMemo(() => ({
    bpm: genre === 'EDM' ? 128 : genre === 'Trap' ? 140 : genre === 'RnB' ? 96 : 110,
    key: genre === 'RnB' ? 'F#m' : 'Am'
  }), [genre]);

  async function generate() {
    setLoading(true);
    setError('');
    setSaved(false);
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ genre, language, mood, idea, energy })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível gerar a música.');
      setGenerated(data);
      setActiveTab('lyrics');
    } catch (err) {
      setError(err.message || 'Erro ao gerar a música.');
    } finally {
      setLoading(false);
    }
  }

  function saveSong() {
    if (!generated) return;
    const library = JSON.parse(localStorage.getItem('musicai-library') || '[]');
    localStorage.setItem('musicai-library', JSON.stringify([{ ...generated, genre, language, mood, energy, savedAt: Date.now() }, ...library].slice(0, 50)));
    setSaved(true);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Music2 size={21}/></div><span>Music<span>AI</span></span></div>
        <nav>
          <button className="nav-item active"><Sparkles size={18}/> Estúdio</button>
          <button className="nav-item"><Library size={18}/> Minha Biblioteca</button>
          <button className="nav-item"><SlidersHorizontal size={18}/> Definições</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="mini-card"><Sparkles size={17}/><div><strong>MusicAI Studio</strong><small>Crie. Escreva. Produza.</small></div></div>
          <small>Versão 0.2 · IA ligada</small>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><span className="eyebrow">ESTÚDIO</span><h1>Componha sua faixa</h1></div>
          <div className="status"><span className="dot"/> Sistema pronto</div>
        </header>

        <section className="studio-grid">
          <div className="card controls-card">
            <div className="section-head"><div><span className="eyebrow">CRIADOR</span><h2>Defina a direção</h2></div><Sparkles size={20}/></div>

            <label>ESTILO</label>
            <div className="genre-grid">
              {genres.map(g => <button key={g} onClick={() => setGenre(g)} className={`genre ${genre === g ? 'selected' : ''}`}>{g}</button>)}
            </div>

            <label>IDIOMA</label>
            <div className="select-wrap"><select value={language} onChange={e => setLanguage(e.target.value)}>{languages.map(x => <option key={x}>{x}</option>)}</select><ChevronDown size={16}/></div>

            <label>CLIMA</label>
            <div className="select-wrap"><select value={mood} onChange={e => setMood(e.target.value)}>{moods.map(x => <option key={x}>{x}</option>)}</select><ChevronDown size={16}/></div>

            <label>TEMA / IDEIA</label>
            <textarea value={idea} onChange={e => setIdea(e.target.value)} />

            <div className="energy-row"><label>ENERGIA</label><strong>{energy}%</strong></div>
            <input className="range" type="range" min="0" max="100" value={energy} onChange={e => setEnergy(Number(e.target.value))}/>

            <button className="generate" onClick={generate} disabled={loading}>
              {loading ? <><Loader2 size={18} className="spin"/> A criar letra e acordes...</> : <><Sparkles size={18}/> Gerar Música</>}
            </button>
            {error && <div className="error-box"><AlertCircle size={16}/><span>{error}</span></div>}
          </div>

          <div className="card output-card">
            {!generated ? (
              <div className="empty"><div className="empty-icon"><Music2 size={30}/></div><h2>A sua próxima música começa aqui</h2><p>Escolha um estilo, defina a ideia e clique em <b>Gerar Música</b>. A MusicAI vai criar uma letra original e uma progressão de acordes.</p></div>
            ) : (
              <>
                <div className="output-top">
                  <div><span className="eyebrow">GERADO PELA MUSICAI</span><h2>{generated.title}</h2><p>{genre} · {mood} · {language}</p></div>
                  <button className="icon-btn" onClick={saveSong} title="Guardar"><Save size={18}/></button>
                </div>
                <div className="meta"><span>{generated.bpm || fallbackMeta.bpm} BPM</span><span>Tom {generated.key || fallbackMeta.key}</span><span>{energy}% energia</span></div>
                <div className="tabs">
                  <button className={`tab ${activeTab === 'lyrics' ? 'active' : ''}`} onClick={() => setActiveTab('lyrics')}>Letra</button>
                  <button className={`tab ${activeTab === 'chords' ? 'active' : ''}`} onClick={() => setActiveTab('chords')}>Cifras</button>
                </div>

                {activeTab === 'lyrics' ? (
                  <article className="lyrics">
                    {generated.sections.map((section, index) => (
                      <div key={`${section.name}-${index}`} className="song-section">
                        <h3>{section.name}</h3>
                        <p>{section.lyrics}</p>
                      </div>
                    ))}
                  </article>
                ) : (
                  <article className="lyrics chords-view">
                    {generated.sections.map((section, index) => (
                      <div key={`${section.name}-chords-${index}`} className="song-section">
                        <h3>{section.name}</h3>
                        <p className="chords">{section.chords}</p>
                      </div>
                    ))}
                  </article>
                )}
                {saved && <div className="toast"><Save size={15}/> Música salva na biblioteca.</div>}
              </>
            )}
          </div>
        </section>

        <section className="stems card">
          <div className="section-head"><div><span className="eyebrow">AUDIO ENGINE</span><h2>Geração de Áudio e Stems</h2></div><span className="coming"><Lock size={13}/> Em Breve</span></div>
          <p className="muted">A estrutura já está preparada para gerar faixas de áudio separadas.</p>
          <div className="tracks">
            {[['Vocais', Mic2], ['Drums', Drum], ['Bass', Waves], ['Melody', Piano]].map(([name, Icon]) => <div className="track" key={name}><Icon size={18}/><div><strong>{name}</strong><div className="track-line"><span/></div></div><Lock size={14}/></div>)}
          </div>
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
