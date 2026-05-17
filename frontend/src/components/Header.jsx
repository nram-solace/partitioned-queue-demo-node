import { motion } from 'framer-motion'
import { dashboardVersionLabel } from '../config'

function Header({
  connected,
  connectionLabel,
  profile,
  catalogProfiles = [],
  selectedProfileId,
  onProfileChange,
  activeView,
  onViewChange,
  showPrediction,
}) {
  const primaryTitle = `Solace Queue Types Demo - ${dashboardVersionLabel()}`
  const profileTitle = profile?.branding?.appTitle?.trim() || null
  const showPicker = catalogProfiles.length > 1

  return (
    <header className="bg-slate-800 border-b border-slate-700 shadow-lg">
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold text-white mb-2">{primaryTitle}</h1>
            {showPicker ? (
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="profile-picker" className="text-sm text-slate-400">
                  Demo profile
                </label>
                <select
                  id="profile-picker"
                  value={selectedProfileId || ''}
                  onChange={(e) => onProfileChange?.(e.target.value)}
                  disabled={!connected || catalogProfiles.length === 0}
                  className="bg-slate-700 border border-slate-600 text-slate-100 rounded-md px-3 py-1.5 text-sm min-w-[12rem] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {catalogProfiles.length === 0 ? (
                    <option value="">Loading profiles…</option>
                  ) : (
                    catalogProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.branding?.appTitle || p.id}
                      </option>
                    ))
                  )}
                </select>
              </div>
            ) : profileTitle ? (
              <p className="text-lg text-slate-400 font-medium">{profileTitle}</p>
            ) : (
              <p className="text-sm text-slate-500">Connect to Solace to load a demo profile…</p>
            )}
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {showPrediction && typeof onViewChange === 'function' && (
              <div className="flex bg-slate-700/50 rounded-lg p-1 gap-1">
                {[
                  { key: 'cards', label: 'Message Flow' },
                  { key: 'prediction', label: 'Prediction' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onViewChange(key)}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                      activeView === key
                        ? key === 'prediction'
                          ? 'bg-indigo-600 text-white shadow'
                          : 'bg-slate-500 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3">
              <motion.div
                animate={{
                  scale: connected ? [1, 1.2, 1] : 1,
                }}
                transition={{
                  duration: 2,
                  repeat: connected ? Infinity : 0,
                }}
                className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
              />
              <span className="text-sm font-medium">
                {connected ? connectionLabel || 'Connected to Solace' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
