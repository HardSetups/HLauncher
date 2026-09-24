import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import '@fontsource/chakra-petch/500.css'
import '@fontsource/chakra-petch/600.css'
import '@fontsource/chakra-petch/700.css'
import './index.css'
import App from './App.jsx'

// reducedMotion="user": işletim sisteminde "animasyonları azalt" açıksa framer
// animasyonları (sayfa geçişi, modal, menü, indirme paneli) kayma/ölçek yapmaz,
// yalnızca opaklık değişir. CSS tarafı index.css'teki medya sorgusuyla kapanır.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
)
