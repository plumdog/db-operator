// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LogFn = (message: string, obj?: Record<string, any>) => void;
export interface Logger {
    info: LogFn;
    debug: LogFn;
    warn: LogFn;
    error: LogFn;
}
const logLevels: Record<string, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

const nullLogFn: LogFn = () => {
    // Do nothing
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getJsonLogFn = (levelName: string) => (message: string, obj?: Record<string, any>) => {
    console.log(
        JSON.stringify(
            {
                message,
                level: levelName,
                ...obj,
            },
            null,
            2,
        ),
    );
};

const getLogFn = (setLevel: string | undefined, requiredLevel: string): LogFn => {
    if (!setLevel) {
        return nullLogFn;
    }

    const setLevelNumber = logLevels[setLevel];
    const requiredLevelNumber = logLevels[requiredLevel];

    if (!setLevelNumber || !requiredLevelNumber) {
        return nullLogFn;
    }

    if (setLevelNumber >= requiredLevelNumber) {
        return getJsonLogFn(requiredLevel);
    }

    return nullLogFn;
};

export const getLogger = (level: string | undefined): Logger => ({
    debug: getLogFn(level, 'debug'),
    info: getLogFn(level, 'info'),
    warn: getLogFn(level, 'warn'),
    error: getLogFn(level, 'error'),
});
