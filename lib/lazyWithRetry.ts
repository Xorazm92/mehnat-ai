import React, { ComponentType, lazy } from 'react';

/**
 * A wrapper around React.lazy that retries the dynamic import
 * if it fails due to network issues or chunk load errors.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
    componentImport: () => Promise<{ default: T }>,
    retriesLeft = 2,
    interval = 1000
): React.LazyExoticComponent<T> {
    return lazy(async () => {
        try {
            return await componentImport();
        } catch (error: any) {
            if (retriesLeft > 0) {
                await new Promise((resolve) => setTimeout(resolve, interval));
                return lazyWithRetry(componentImport, retriesLeft - 1, interval * 2)._payload._result();
            }

            // If we're out of retries, throw the error so ErrorBoundary can catch it
            throw error;
        }
    }) as any;
}

export default lazyWithRetry;
