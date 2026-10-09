import { Link } from 'react-router-dom';
import { Box } from 'lucide-react';
export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Room Planner home">
      <span>
        <Box size={21} strokeWidth={1.5} />
      </span>
      room<span className="brand-light">planner</span>
    </Link>
  );
}
