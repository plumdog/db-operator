import { DbOperator } from './operator';
import { getLogger } from './logger';

export const main = async () => {
    const logger = getLogger('info');
    logger.info('Start');
    const operator = new DbOperator();
    await operator.start();

    const exit = (reason: string) => {
        logger.info('Stopping', {
            reason,
        });
        operator.stop();
        process.exit(0);
    };

    process.on('SIGTERM', () => exit('SIGTERM')).on('SIGINT', () => exit('SIGINT'));
    console.log('Done');
};

main();
