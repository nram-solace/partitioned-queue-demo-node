import { motion } from 'framer-motion'

function Header({ connected, profile, activeView, onViewChange, showPrediction }) {
  const title = profile?.branding?.appTitle ?? 'Queue types demo'
  const subtitle =
    profile?.branding?.subtitle ?? 'Solace PubSub+ Event Broker — connect the consumer to load profile'

  return (
    <header className="bg-slate-800 border-b border-slate-700 shadow-lg">
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">{title}</h1>
            <p className="text-slate-400">{subtitle}</p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {showPrediction && typeof onViewChange === 'function' && (
              <div className="flex bg-slate-700/50 rounded-lg p-1 gap-1">
                {[
                  { key: 'cards', label: 'Message Flow' },
                  { key: 'prediction', label: 'Price Prediction' },
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
              <span className="text-sm font-medium">{connected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
