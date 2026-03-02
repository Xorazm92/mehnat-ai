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
        for (let i = 0; i <= retriesLeft; i++) {
            try {
                return await componentImport();
            } catch (error: any) {
                if (i === retriesLeft) throw error;
                // Exponential backoff
                await new Promise((resolve) => setTimeout(resolve, interval * Math.pow(2, i)));
            }
        }
        throw new Error('Unreachable');
    });
}

export default lazyWithRetry;
