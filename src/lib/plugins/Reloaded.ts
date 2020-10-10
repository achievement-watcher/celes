'use strict';

import * as path from 'path';
import {ReloadedAchievement, ReloadedAchievementList, Source, UnlockedOrInProgressAchievement} from '../../types';
import {normalizeProgress, normalizeTimestamp} from './lib/Common';
import {SteamEmulatorScraper} from './lib/SteamEmulatorScraper';
import omit from 'lodash.omit';

class Reloaded extends SteamEmulatorScraper {
    readonly source: Source = 'Reloaded - 3DM';
    readonly achievementWatcherRootPath: string;
    readonly achievementLocationFiles: string[] = [
        'stats/achievements.ini'
    ];

    private readonly programDataPath: string = <string>process.env['PROGRAMDATA'];

    constructor(achievementWatcherRootPath: string) {
        super();
        this.achievementWatcherRootPath = achievementWatcherRootPath;
    }

    normalizeUnlockedOrInProgressAchievementList(achievementList: ReloadedAchievementList): UnlockedOrInProgressAchievement[] {
        const UnlockedOrInProgressAchievementList: UnlockedOrInProgressAchievement[] = [];

        const filter: string[] = ['Steam', 'Steam64'];
        achievementList = omit(achievementList, filter);

        Object.keys(achievementList).forEach((achievementName) => {
            const achievementData: ReloadedAchievement = achievementList[achievementName];
            const normalizedProgress = normalizeProgress(achievementData.CurProgress, achievementData.MaxProgress);

            if (achievementData.State === '0100000001') {
                UnlockedOrInProgressAchievementList.push({
                    name: achievementName,
                    achieved: 1,
                    currentProgress: normalizedProgress.currentProgress,
                    maxProgress: normalizedProgress.maximProgress,
                    unlockTime: normalizeTimestamp(achievementData.Time)
                });
            } else if (normalizedProgress.maximProgress > 0) {
                UnlockedOrInProgressAchievementList.push({
                    name: achievementName,
                    achieved: 0,
                    currentProgress: normalizedProgress.currentProgress,
                    maxProgress: normalizedProgress.maximProgress,
                    unlockTime: normalizeTimestamp(achievementData.Time)
                });
            }
        });

        return UnlockedOrInProgressAchievementList;
    }

    getSpecificFoldersToScan(): string[] {
        return [
            path.join(this.programDataPath, 'Steam') + '/*'
        ];
    }
}

export {Reloaded};