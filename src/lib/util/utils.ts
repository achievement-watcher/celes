'use strict';

import {GameSchema, GameSchemaBody, Platform} from '../../types';
import {SteamUtils} from '../plugins/lib/SteamUtils';

async function getGameSchema(appId: string, platform: Platform, language: string): Promise<GameSchemaBody> {
    if (platform === 'Steam') {
        const gameSchema: GameSchema = await SteamUtils.getGameSchema(appId, language);
        const gameSchemaBody: GameSchemaBody = {
            name: gameSchema.name,
            img: gameSchema.img,
            achievements: gameSchema.achievement
        }

        if ('binary' in gameSchemaBody) {
            gameSchemaBody.binary = gameSchema.binary;
        }

        return gameSchemaBody;
    } else {
        throw new Error('Platform schema not available for ' + platform);
    }
}

export {getGameSchema};