// A KPI summary card for the Dashboard.
// Props: title, value, subtitle, icon (emoji or SVG), color ('blue'|'green'|'yellow'|'red')
export default function StatCard({ title, value, subtitle, icon, color = 'blue' }) {
  const colors = {
    blue:   'bg-blue-50   text-blue-700',
    green:  'bg-green-50  text-green-700',
    yellow: 'bg-yellow-50 text-yellow-700',
    red:    'bg-red-50    text-red-700',
  };
  return (
    <div className="card flex items-start gap-4">
      <div className={`p-3 rounded-xl text-2xl ${colors[color]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-sm text-gray-500 font-medium">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5 truncate">{value}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}
