import { RouterProvider } from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';
import { loadInitialSession } from './lib/active-session';
import { createAppRouter } from './router';
import './style.css';

const root = document.getElementById('root');
if (!root) {
	throw new Error('Missing #root element.');
}

const router = createAppRouter({ initialSession: await loadInitialSession() });
createRoot(root).render(<RouterProvider router={router} />);
