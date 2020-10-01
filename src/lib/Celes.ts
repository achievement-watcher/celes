import {IExportableGameData, IGameData, IGameMetadata, IUnlockedAchievement} from '../types';
import {Parser} from './plugin/lib/Parser';

const path = require('path');
const mkdirp = require('mkdirp');
const fs = require('fs').promises;

class Celes {
    private readonly additionalFoldersToScan: string[];
    private readonly ignoreSourceAtMerge: boolean;
    private readonly systemLanguage: string;
    private readonly useOldestUnlockTime: boolean;

    private readonly achievementWatcherRootPath: string = path.join(<string>process.env['APPDATA'], 'Achievement Watcher');
    private readonly celesDatabasePath: string = path.join(this.achievementWatcherRootPath, 'celes/db/');

    constructor(
        additionalFoldersToScan: string[] = [],
        systemLanguage: string = 'english',
        ignoreSourceAtMerge: boolean = true,
        useOldestUnlockTime: boolean = true
    ) {
        this.additionalFoldersToScan = additionalFoldersToScan;
        this.ignoreSourceAtMerge = ignoreSourceAtMerge;
        this.systemLanguage = systemLanguage;
        this.useOldestUnlockTime = useOldestUnlockTime;
    }

    private mergeUnlockedAchievements(ua1: IUnlockedAchievement[], ua2: IUnlockedAchievement[]): IUnlockedAchievement[] {
        const mergedUnlockedAchievements: { [key: string]: IUnlockedAchievement } = {};

        for (let k = 0; k < ua1.length; k++) {
            mergedUnlockedAchievements[ua1[k].name] = ua1[k];
        }

        for (let j = 0; j < ua2.length; j++) {
            if (!(ua2[j].name in mergedUnlockedAchievements)) {
                mergedUnlockedAchievements[ua2[j].name] = ua2[j];
            } else {
                if (ua2[j].currentProgress > mergedUnlockedAchievements[ua2[j].name].currentProgress) {
                    mergedUnlockedAchievements[ua2[j].name] = ua2[j];
                } else if (this.useOldestUnlockTime) {
                    if (ua2[j].unlockTime < mergedUnlockedAchievements[ua2[j].name].unlockTime) {
                        mergedUnlockedAchievements[ua2[j].name] = ua2[j];
                    }
                } else {
                    if (ua2[j].unlockTime > mergedUnlockedAchievements[ua2[j].name].unlockTime) {
                        mergedUnlockedAchievements[ua2[j].name] = ua2[j];
                    }
                }
            }
        }

        return Object.keys(mergedUnlockedAchievements).map(function (name) {
            return mergedUnlockedAchievements[name];
        });
    }

    async load(callbackProgress?: Function): Promise<IExportableGameData[]> {
        const databaseData: IExportableGameData[] = await this.loadLocalDatabase(callbackProgress);
        const scrappedData: IExportableGameData[] = await this.scrapLocalFolders(callbackProgress);

        const mergedData: IExportableGameData[] = this.mergeExportableGameData(scrappedData, databaseData);
        await this.updateLocalDatabase(mergedData);

        return mergedData;
    }

    async export(path: string) {
        const exportableGameData: IExportableGameData[] = await this.load();
        await fs.writeFile(path, JSON.stringify(exportableGameData, undefined, 2));
    }

    async import(path: string, force: boolean = false) {
        const importedData: IExportableGameData[] = await JSON.parse(await fs.readFile(path));

        if (!force) {
            const localData: IExportableGameData[] = await this.loadLocalDatabase();
            const mergedData: IExportableGameData[] = this.mergeExportableGameData(localData, importedData);

            await this.updateLocalDatabase(mergedData);
        } else {
            await this.updateLocalDatabase(importedData);
        }
    }

    private mergeExportableGameData(egd1: IExportableGameData[], egd2: IExportableGameData[]): IExportableGameData[] {
        const mergedGames: { [key: string]: IExportableGameData } = {};

        for (let i = 0; i < egd1.length; i++) {
            let sortKey: string = egd1[i].appid + egd1[i].platform;
            if (!this.ignoreSourceAtMerge) {
                sortKey += egd1[i].source;
            }

            mergedGames[sortKey] = egd1[i];
        }

        for (let j = 0; j < egd2.length; j++) {
            let sortKey: string = egd2[j].appid + egd2[j].platform;
            if (!this.ignoreSourceAtMerge) {
                sortKey += egd2[j].source;
            }

            mergedGames[sortKey] = egd2[j];

            if (!(egd2[j].appid in mergedGames)) {
                mergedGames[egd2[j].appid] = egd2[j];
            } else {
                if (egd2[j].achievement.total > mergedGames[egd2[j].appid].achievement.total) {
                    mergedGames[egd2[j].appid].achievement.total = egd2[j].achievement.total;
                    mergedGames[egd2[j].appid].achievement.list = egd2[j].achievement.list;
                }

                mergedGames[egd2[j].appid].achievement.unlocked = this.mergeUnlockedAchievements(
                    mergedGames[egd2[j].appid].achievement.unlocked,
                    egd2[j].achievement.unlocked
                );
            }
        }

        return Object.keys(mergedGames).map(function (appId) {
            return mergedGames[appId];
        });
    }

    private async scrapLocalFolders(callbackProgress?: Function): Promise<IExportableGameData[]> {
        const pluginsFolder = path.join(__dirname, 'plugin');
        const exportableGames: IExportableGameData[] = [];

        const pluginsFolderFiles: string[] = await fs.readdir(pluginsFolder);

        for (let i = 0; i < pluginsFolderFiles.length; i++) {
            const progressPercentage: number = 50 + Math.floor((i / pluginsFolderFiles.length) * 50);

            try {
                if (pluginsFolderFiles[i].endsWith('.js')) {
                    const plugin = require('./plugin/' + pluginsFolderFiles[i]);
                    const parser: Parser = new plugin[Object.keys(plugin)[0]]();

                    const listOfGames: IGameMetadata[] = await parser.scan(this.additionalFoldersToScan);

                    for (let j = 0; j < listOfGames.length; j++) {
                        const gameData: IGameData = await parser.getGameData(listOfGames[j].appId, this.systemLanguage);
                        const unlockedAchievements: IUnlockedAchievement[] = await parser.getAchievements(listOfGames[j]);

                        const exportableGameDataSkeleton: any = gameData;
                        exportableGameDataSkeleton.achievement.unlocked = unlockedAchievements;

                        const exportableGameData: IExportableGameData = exportableGameDataSkeleton;

                        exportableGames.push(exportableGameData);
                    }
                }
            } catch (error) {
                console.debug('DEBUG: Error loading plugin', pluginsFolderFiles[i] + ':', error);
            }

            if (callbackProgress instanceof Function) {
                callbackProgress(progressPercentage);
            }
        }

        return exportableGames;
    }

    private async loadLocalDatabase(callbackProgress?: Function): Promise<IExportableGameData[]> {
        let localData: IExportableGameData[] = [];

        try {
            const localDatabaseFiles: string[] = await fs.readdir(this.celesDatabasePath);

            for (let i = 0; i < localDatabaseFiles.length; i++) {
                const progressPercentage: number = Math.floor((i / localDatabaseFiles.length) * 50);

                try {
                    const localGameData: IExportableGameData = JSON.parse(await fs.readFile(this.celesDatabasePath + localDatabaseFiles[i]));
                    localData.push(localGameData);
                } catch (error) {
                    console.debug('DEBUG: Error loading local database', localDatabaseFiles[i] + ':', error);
                }

                if (callbackProgress instanceof Function) {
                    callbackProgress(progressPercentage);
                }
            }
        } catch (error) {
            console.debug('DEBUG: Error loading local database:', error);
        }

        return localData;
    }

    private async updateLocalDatabase(gameData: IExportableGameData[]): Promise<void> {
        await mkdirp(this.celesDatabasePath);

        for (let i = 0; i < gameData.length; i++) {
            await fs.writeFile(path.join(this.celesDatabasePath, gameData[i].appid + '.json'), JSON.stringify(gameData[i]));
        }
    }
}

export {Celes};