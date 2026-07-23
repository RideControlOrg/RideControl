import {
	createRootRoute,
	createRoute,
	createRouter,
	type RouterHistory,
	redirect,
} from '@tanstack/react-router';
import { createElement } from 'react';
import { App } from './app';
import { emptySession } from './constants';
import { APP_ROUTE_PATH } from './lib/app-route';
import type { StoredSession } from './types';

export interface AppRouterOptions {
	history?: RouterHistory;
	initialSession?: StoredSession;
}

export function createAppRouter({ history, initialSession = emptySession }: AppRouterOptions = {}) {
	const rootRoute = createRootRoute({
		component: () => createElement(App, { initialSession }),
	});
	const childRoutes = [
		createRoute({ getParentRoute: () => rootRoute, path: APP_ROUTE_PATH.HOME }),
		createRoute({ getParentRoute: () => rootRoute, path: APP_ROUTE_PATH.DEVICES }),
		createRoute({ getParentRoute: () => rootRoute, path: APP_ROUTE_PATH.WORKOUTS }),
		createRoute({ getParentRoute: () => rootRoute, path: APP_ROUTE_PATH.WORKOUT }),
		createRoute({ getParentRoute: () => rootRoute, path: APP_ROUTE_PATH.BIKEGPX }),
		createRoute({ getParentRoute: () => rootRoute, path: APP_ROUTE_PATH.BIKEGPX_ROUTE }),
		createRoute({ getParentRoute: () => rootRoute, path: APP_ROUTE_PATH.SESSIONS }),
		createRoute({ getParentRoute: () => rootRoute, path: APP_ROUTE_PATH.SESSION }),
		createRoute({
			beforeLoad: () => {
				throw redirect({ replace: true, to: APP_ROUTE_PATH.HOME });
			},
			getParentRoute: () => rootRoute,
			path: '$',
		}),
	];
	return createRouter({
		history,
		routeTree: rootRoute.addChildren(childRoutes),
		trailingSlash: 'never',
	});
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
	interface Register {
		router: AppRouter;
	}
}
