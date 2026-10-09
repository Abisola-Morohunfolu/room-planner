import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, MoveRight } from 'lucide-react';
import { Brand } from '../components/Brand';
import { CreateProjectDialog } from '../components/CreateProjectDialog';
import { newProject, newItem, uid } from '../domain/model';
import { database, makeRecord } from '../persistence/database';
export default function LandingPage() {
  const [creating, setCreating] = useState(false),
    [error, setError] = useState<string | null>(null),
    navigate = useNavigate();
  const example = async () => {
    const document = newProject('A relaxed living room');
    document.layouts[0].room = { ...document.layouts[0].room, widthMm: 5000, depthMm: 4000 };
    document.layouts[0].items = [
      newItem('rug-rect', 2100, 2100),
      newItem('sofa-3', 2200, 750),
      newItem('coffee-round', 2200, 1900),
      { ...newItem('armchair', 800, 2350), rotationDeg: 270 },
      newItem('dining-rect', 4000, 2350),
      newItem('dining-chair', 4000, 1500),
      { ...newItem('dining-chair', 4000, 3200), rotationDeg: 180 },
      newItem('floor-lamp', 3600, 600),
    ];
    document.layouts[0].openings = [
      {
        id: uid(),
        type: 'door',
        wallId: 'west',
        offsetMm: 100,
        widthMm: 900,
        heightMm: 2100,
        sillHeightMm: 0,
        hinge: 'right',
        swing: 'inward',
      },
      {
        id: uid(),
        type: 'window',
        wallId: 'north',
        offsetMm: 1000,
        widthMm: 1800,
        heightMm: 1200,
        sillHeightMm: 900,
        hinge: 'left',
        swing: 'inward',
      },
    ];
    try {
      await database.projects.add(makeRecord(document));
      navigate(`/plan/${document.projectId}`);
    } catch {
      setError('Enable device storage to open the example.');
    }
  };
  return (
    <div className="landing">
      <header className="site-header">
        <Brand />
        <nav>
          <Link to="/projects">Your rooms</Link>
          <button className="small-primary" onClick={() => setCreating(true)}>
            Start a room <ArrowUpRight size={16} />
          </button>
        </nav>
      </header>
      <main>
        <section className="landing-hero">
          <div className="hero-copy">
            <h1>
              See how it fits.
              <br />
              <em>Then make it yours.</em>
            </h1>
            <p className="hero-description">
              The sofa you love. The desk you need. A little more space to breathe. Plan your room
              with real measurements, before you move a thing.
            </p>
            <div className="hero-actions">
              <button className="primary" onClick={() => setCreating(true)}>
                Plan your room <MoveRight size={19} />
              </button>
              <button className="text-button" onClick={() => void example()}>
                Explore a furnished example <ArrowUpRight size={16} />
              </button>
            </div>
            <p className="hero-note">Free · No account needed · Yours to arrange</p>
            {error && <p role="alert">{error}</p>}
          </div>
          <div className="hero-room">
            <img
              src="/furnished-room.png"
              alt="A furnished living room in Room Planner with a green sofa, armchair, timber tables, blue dining chair, window and coloured walls."
              width="2048"
              height="1382"
              fetchPriority="high"
            />
            <div className="room-annotation">
              <span className="annotation-line" />
              <p>
                Every centimetre.
                <br />
                <strong>A little more considered.</strong>
              </p>
            </div>
            <div className="hero-measure">
              5.0 m × 4.0 m <span>FURNISHED EXAMPLE</span>
            </div>
          </div>
        </section>
        <section className="landing-steps">
          <div>
            <span>01</span>
            <h2>Measure your space.</h2>
            <p>A rectangle or an L-shape. Add your doors and windows.</p>
          </div>
          <div>
            <span>02</span>
            <h2>Try a few possibilities.</h2>
            <p>Arrange in 2D, explore in 3D, and compare three alternatives.</p>
          </div>
          <div>
            <span>03</span>
            <h2>Make your next move.</h2>
            <p>Save your room and export measurements or a purchase list.</p>
          </div>
        </section>
      </main>
      <footer>
        <Brand />
        <p>A plan for the room. Space for the life.</p>
        <Link to="/projects">
          Saved on your device <ArrowUpRight size={14} />
        </Link>
      </footer>
      {creating && <CreateProjectDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
