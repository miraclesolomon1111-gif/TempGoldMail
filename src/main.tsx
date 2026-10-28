import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './lib/firebase.ts';
import { AuthProvider } from './context/AuthContext.tsx';

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <App />
  </AuthProvider>
);


