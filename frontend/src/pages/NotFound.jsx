import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center p-8">
      <p className="text-6xl mb-4">🏪</p>
      <h1 className="text-4xl font-bold text-gray-900 mb-2">404</h1>
      <p className="text-gray-500 mb-6">Oops! That page doesn't exist.</p>
      <Link to="/" className="btn-primary">Go to Dashboard</Link>
    </div>
  );
}
