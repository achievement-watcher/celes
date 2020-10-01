import {IGameData, IGameMetadata, IUnlockedAchievement} from '../../../types';

interface Parser {
    getAchievements(game: IGameMetadata): Promise<IUnlockedAchievement[]>;

    getGameData(appId: string, lang?: string, key?: string): Promise<IGameData>;

    scan(additionalFoldersToScan?: string[]): Promise<IGameMetadata[]>;
}

export {Parser};