import { motion } from 'framer-motion'

function Header({ connected }) {
  return (
    <header className="bg-slate-800 border-b border-slate-700 shadow-lg">
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Stock Order Processing Demo
            </h1>
            <p className="text-slate-400">
              Solace PubSub+ Event Broker - Queue Types Comparison
            </p>
          </div>
          <div className="flex items-center gap-3">
            <motion.div
              animate={{
                scale: connected ? [1, 1.2, 1] : 1,
              }}
              transition={{
                duration: 2,
                repeat: connected ? Infinity : 0,
              }}
              className={`w-3 h-3 rounded-full ${
                connected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className="text-sm font-medium">
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
