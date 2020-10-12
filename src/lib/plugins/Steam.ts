import * as path from 'path';
import {
    GameSchema,
    ScanResult,
    Source,
    SteamGameMetadata,
    SteamUser,
    SteamUserData,
    UnlockedOrInProgressAchievement
} from '../../types';
import {AchievementsScraper} from './lib/AchievementsScraper';
import {SteamIdUtils} from './lib/SteamIdUtils';
import {existsSync} from 'fs';
import glob from 'fast-glob';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import regedit from 'regodit'; // TODO LOOK FOR ALTERNATIVES

class Steam implements AchievementsScraper {
    private static async getSteamPath(): Promise<string> {
        /*
          Some SteamEmu change HKCU/Software/Valve/Steam/SteamPath to the game's dir
          Fallback to Software/WOW6432Node/Valve/Steam/InstallPath in this case
          NB: Steam client correct the key on startup
        */ // TODO TURN INTO DOCS

        const regHives = [
            {root: 'HKCU', key: 'Software/Valve/Steam', name: 'SteamPath'},
            {root: 'HKLM', key: 'Software/WOW6432Node/Valve/Steam', name: 'InstallPath'}
        ];

        for (const regHive of regHives) {
            const steamPath: string = await regedit.promises.RegQueryStringValue(regHive.root, regHive.key, regHive.name);
            if (steamPath) {
                if (existsSync(path.join(steamPath, 'steam.exe'))) {
                    return steamPath;
                }
            }
        }

        throw new Error('Steam Path not found'); // TODO PROPER ERROR
    }

    private static async getSteamUsers(steamPath: string): Promise<SteamUser[]> {
        const steamUsers: SteamUser[] = [];

        let users: (string | number)[] = await regedit.promises.RegListAllSubkeys('HKCU', 'Software/Valve/Steam/Users');
        if (!users) {
            users = await glob('*([0-9])', {
                cwd: path.join(steamPath, 'userdata'),
                onlyDirectories: true,
                absolute: false
            });
        }

        if (users.length == 0) {
            return [];
        }

        for (const user of users) {
            const id: string = SteamIdUtils.getSteamId64(user);
            const data: SteamUserData = await SteamIdUtils.getUserData(id);

            if (data.privacyState === 'public') {
                steamUsers.push({
                    user: user.toString(),
                    id: id,
                    name: data.steamID
                });
            } else {
                console.log(`${user} - ${id} (${data.steamID}) is not public`);  // TODO PROPER ERROR
            }
        }

        return steamUsers;
    }

    private readonly achievementWatcherRootPath: string;
    private readonly source: Source = 'Steam';
    private readonly listingType: 0 | 1 | 2;

    constructor(achievementWatcherRootPath: string, listingType: 0 | 1 | 2 = 0) {
        this.achievementWatcherRootPath = achievementWatcherRootPath;
        this.listingType = listingType;
    }

    getSource(): Source {
        return this.source;
    }

    async getUnlockedOrInProgressAchievements(game: ScanResult): Promise<UnlockedOrInProgressAchievement[]> {
        throw new Error(game.toString()); // TODO
    }

    async getGameSchema(appId: string, lang?: string, key?: string): Promise<GameSchema> {
        throw new Error(appId + lang + key); // TODO
    }

    async scan(): Promise<ScanResult[]> {
        const gamesMetadata: ScanResult[] = [];

        if (this.listingType > 0 && regedit.RegKeyExists('HKCU', 'Software/Valve/Steam')) {
            const steamPath = await Steam.getSteamPath();
            const steamCachePath = path.join(steamPath, 'appcache/stats');
            const publicUsers = await Steam.getSteamUsers(steamPath);

            const legitGamesList: SteamGameMetadata[] = (await glob('UserGameStats_*([0-9])_*([0-9]).bin', {
                cwd: steamCachePath,
                onlyFiles: true,
                absolute: false
            })).map((filename: string) => {
                const matches: RegExpMatchArray = <RegExpMatchArray>filename.match(/([0-9]+)/g);
                return {
                    userId: matches[0],
                    appId: matches[1]
                };
            });

            for (const game of legitGamesList) {
                let isInstalled = true;
                if (this.listingType == 1) {
                    isInstalled = (await regedit.promises.RegQueryIntegerValue('HKCU',
                        `Software/Valve/Steam/Apps/${game.appId}`, 'Installed') === '1');
                }

                const user: SteamUser = <SteamUser>publicUsers.find((user: SteamUser) => {
                    return user.user == game.userId;
                });

                if (user && isInstalled) {
                    gamesMetadata.push({
                        appId: game.appId,
                        source: 'Steam',
                        platform: 'Steam',
                        data: {
                            type: 'steamAPI',
                            userId: user,
                            cachePath: steamCachePath
                        }
                    });
                }
            }
        }

        return gamesMetadata;
    }

//     async getGameMetadata(config: any) {
//         if (!steamLanguages.some( (language: ISteamLanguage) => { return language.api === config.lang } )) {
//               throw "Unsupported API language code";
//         }
//
//         const cache = path.join(this.achievementWatcherRootPath, 'steam_cache/schema', config.lang);
//
//         try {
//
//             let filePath = path.join(`${cache}`, `${config.appId}.db`);
//
//             let result;
//
//             if (await ffs.promises.existsAndIsYoungerThan(filePath, {timeUnit: 'month', time: 1})) {
//                 result = JSON.parse(await ffs.promises.readFile(filePath));
//             } else {
//                 if (config.key) {
//                     result = await getSteamData(config);
//                 } else {
//                     result = await getSteamDataFromSRV(config.appId, config.lang);
//                 }
//                 ffs.promises.writeFile(filePath, JSON.stringify(result, null, 2)).catch((err) => {
//                 });
//             }
//
//             return result;
//
//         } catch (err) {
//             throw 'Could not load Steam data.';
//         }
//     }
//
//     async getAchievementsFromFile(filePath) {
//         try {
//
//             const files = [
//                 'achievements.ini',
//                 'achievements.json',
//                 'achiev.ini',
//                 'stats.ini',
//                 'Achievements.Bin',
//                 'achieve.dat',
//                 'Achievements.ini',
//                 'stats/achievements.ini',
//                 'stats.bin',
//                 'stats/CreamAPI.Achievements.cfg'
//             ];
//
//             const filter = ['SteamAchievements', 'Steam64', 'Steam'];
//
//             let local;
//             for (let file of files) {
//                 try {
//
//                     if (path.parse(file).ext == '.json') {
//                         local = JSON.parse(await ffs.promises.readFile(path.join(filePath, file), 'utf8'));
//                     } else if (file === 'stats.bin') {
//                         local = sse.parse(await ffs.promises.readFile(path.join(filePath, file)));
//                     } else {
//                         local = ini.parse(await ffs.promises.readFile(path.join(filePath, file), 'utf8'));
//                     }
//                     break;
//                 } catch (e) {
//                 }
//             }
//             if (!local) {
//                 throw `No achievement file found in '${filePath}'`;
//             }
//
//             let result = {};
//
//             if (local.AchievementsUnlockTimes && local.Achievements) { //hoodlum DARKSiDERS
//
//                 for (let i in local.Achievements) {
//                     if (local.Achievements[i] == 1) {
//                         result[`${i}`] = {Achieved: '1', UnlockTime: local.AchievementsUnlockTimes[i] || null};
//                     }
//                 }
//             } else if (local.State && local.Time) { //3DM
//
//                 for (let i in local.State) {
//                     if (local.State[i] == '0101') {
//                         result[i] = {
//                             Achieved: '1',
//                             UnlockTime: new DataView(new Uint8Array(Buffer.from(local.Time[i].toString(), 'hex')).buffer).getUint32(0, true) || null
//                         };
//                     }
//                 }
//             } else {
//                 result = omit(local.ACHIEVE_DATA || local, filter);
//             }
//
//             for (let i in result) {
//                 if (result[i].State) { //RLD!
//                     try {
//                         //uint32 little endian
//                         result[i].State = new DataView(new Uint8Array(Buffer.from(result[i].State.toString(), 'hex')).buffer).getUint32(0, true);
//                         result[i].CurProgress = new DataView(new Uint8Array(Buffer.from(result[i].CurProgress.toString(), 'hex')).buffer).getUint32(0, true);
//                         result[i].MaxProgress = new DataView(new Uint8Array(Buffer.from(result[i].MaxProgress.toString(), 'hex')).buffer).getUint32(0, true);
//                         result[i].Time = new DataView(new Uint8Array(Buffer.from(result[i].Time.toString(), 'hex')).buffer).getUint32(0, true);
//                     } catch (e) {
//                     }
//                 } else if (result[i].unlocktime && result[i].unlocktime.length === 7) { //creamAPI
//                     result[i].unlocktime = +result[i].unlocktime * 1000; //cf: https://cs.rin.ru/forum/viewtopic.php?p=2074273#p2074273 | timestamp is invalid/incomplete
//                 }
//             }
//
//             return result;
//
//         } catch (err) {
//             throw err;
//         }
//     }
//
//     async getAchievementsFromAPI(cfg) {
//
//         try {
//
//             let result;
//
//             let cache = {
//                 local: path.join(this.achievementWatcherRootPath, 'steam_cache/user', cfg.user.user, `${cfg.appId}.db`),
//                 steam: path.join(`${cfg.path}`, `UserGameStats_${cfg.user.user}_${cfg.appId}.bin`)
//             };
//
//             let time = {
//                 local: 0,
//                 steam: 0
//             };
//
//             let local = await ffs.promises.stats(cache.local);
//             if (Object.keys(local).length > 0) {
//                 time.local = moment(local.mtime).valueOf();
//             }
//
//             let steamStats = await ffs.promises.stats(cache.steam);
//             if (Object.keys(steamStats).length > 0) {
//                 time.steam = moment(steamStats.mtime).valueOf();
//             } else {
//                 throw 'No Steam cache file found';
//             }
//
//             if (time.steam > time.local) {
//                 if (cfg.key) {
//                     result = await getSteamUserStats(cfg);
//                 } else {
//                     result = await getSteamUserStatsFromSRV(cfg.user.id, cfg.appId);
//                 }
//                 ffs.promises.writeFile(cache.local, JSON.stringify(result, null, 2)).catch((err) => {
//                 });
//
//             } else {
//                 result = JSON.parse(await ffs.promises.readFile(cache.local));
//             }
//
//             return result;
//
//         } catch (err) {
//             throw 'Could not load Steam User Stats.';
//         }
//
//     }
//
//
//     private async getSteamUsers(steamPath: string): Promise<SteamUser[]> {
//         let steamUsers: SteamUser[] = [];
//
//         let users = await regedit.promises.RegListAllSubkeys('HKCU', 'Software/Valve/Steam/Users');
//         if (!users) {
//             users = await glob('*([0-9])', {
//                 cwd: path.join(steamPath, 'userdata'),
//                 onlyDirectories: true,
//                 absolute: false
//             });
//         }
//
//         if (users.length == 0) {
//             throw 'No Steam User ID found';
//         }
//         for (let user of users) {
//             let id = steamID.to64(user);
//             let data = await steamID.whoIs(id);
//
//             if (data.privacyState === 'public') {
//                 console.log(`${user} - ${id} (${data.steamID}) is public`);
//                 steamUsers.push({
//                     user: user,
//                     id: id,
//                     name: data.steamID
//                 });
//             } else {
//                 console.log(`${user} - ${id} (${data.steamID}) is not public`);
//             }
//         }
//
//         if (steamUsers.length > 0) {
//             return steamUsers;
//         } else {
//             throw 'Public profile: none.';
//         }
//     }
//
//     getSteamUserStatsFromSRV(user, appId) {
//
//         const url = `https://api.xan105.com/steam/user/${user}/stats/${appId}`;
//
//         return new Promise((resolve, reject) => {
//
//             request.getJson(url).then((data) => {
//
//                 if (data.error) {
//                     return reject(data.error);
//                 } else if (data.data) {
//                     return resolve(data.data);
//                 } else {
//                     return reject('Unexpected Error');
//                 }
//
//             }).catch((err) => {
//                 return reject(err);
//             });
//
//         });
//     }
//
//     async getSteamUserStats(cfg) {
//
//         const url = `http://api.steampowered.com/SteamUserStats/GetPlayerAchievements/v0001/?appId=${cfg.appId}&key=${cfg.key}&steamid=${cfg.user.id}"`;
//
//         try {
//
//             let result = await request.getJson(url);
//             return result.playerstats.achievements;
//
//         } catch (err) {
//             throw err;
//         }
//
//     };
//
//     getSteamDataFromSRV(appId, lang) {
//
//         const url = `https://api.xan105.com/steam/ach/${appId}?lang=${lang}`;
//
//         return new Promise((resolve, reject) => {
//
//             request.getJson(url).then((data) => {
//
//                 if (data.error) {
//                     return reject(data.error);
//                 } else if (data.data) {
//                     return resolve(data.data);
//                 } else {
//                     return reject('Unexpected Error');
//                 }
//
//             }).catch((err) => {
//                 return reject(err);
//             });
//
//         });
//     }
//
//     getSteamData(cfg) {
//
//         const url = {
//             api: `https://api.steampowered.com/SteamUserStats/GetSchemaForGame/v0002/?key=${cfg.key}&appId=${cfg.appId}&l=${cfg.lang}&format=json`,
//             store: `https://store.steampowered.com/api/appdetails?appIds=${cfg.appId}`
//         };
//
//         return new Promise((resolve, reject) => {
//
//             Promise.all([request.getJson(url.api), request.getJson(url.store, {headers: {'Accept-Language': 'en-US;q=1.0'}}), scrapSteamDB(cfg.appId)]).then(function (data) {
//
//                 try {
//
//                     let schema = data[0].game.availableGameStats;
//                     let appdetail = data[1][cfg.appId].data;
//                     let steamdb = data[2];
//
//                     let result = {
//                         name: (data[1][cfg.appId].success) ? appdetail.name : steamdb.name, //If the game is no longer available in the store fallback to steamdb
//                         appId: cfg.appId,
//                         binary: path.parse(steamdb.binary).base,
//                         img: {
//                             header: (data[1][cfg.appId].success) ? appdetail.header_image.split('?')[0] : steamdb.header, //If the game is no longer available in the store fallback to steamdb
//                             background: (data[1][cfg.appId].success) ? appdetail.background.split('?')[0] : null,
//                             icon: steamdb.icon
//                         },
//                         achievement: {
//                             total: schema.achievements.length,
//                             list: schema.achievements
//                         }
//                     };
//
//                     return resolve(result);
//
//                 } catch (err) {
//                     return reject(err);
//                 }
//
//             }).catch((err) => {
//                 return reject(err);
//             });
//         });
//     }
//
//     async scrapSteamDB(appId) {
//         try {
//             let data = await request(`https://steamdb.info/app/${appId}/`);
//             let html = htmlParser(data.body);
//
//             let binaries = html.querySelector('#config table tbody').innerHTML.split('</tr>\n<tr>').map((tr) => {
//
//                 let data = tr.split('</td>\n');
//
//                 return {
//                     executable: data[1].replace(/<\/?[^>]+>/gi, '').replace(/[\r\n]/g, ''),
//                     windows: data[4].includes(`aria-label="windows"`) || (!data[4].includes(`aria-label="macOS"`) && !data[4].includes(`aria-label="Linux"`)) ? true : false,
//                 };
//
//             });
//
//             let result = {
//                 binary: binaries.find(binary => binary.windows).executable.match(/([^\\\/\:\*\?\"\<\>\|])+$/)[0],
//                 icon: html.querySelector('.app-icon.avatar').attributes.src,
//                 header: html.querySelector('.app-logo').attributes.src,
//                 name: html.querySelector('.css-truncate').innerHTML
//             };
//
//             return result;
//
//         } catch (err) {
//             throw err;
//         }
//     }
//
//     async getFoldersToScan(additionalFoldersToScan: string[]): string[] {
//         let foldersToScan: string[] = [
//             path.join(this.publicDataPath, 'Documents/Steam/CODEX'),
//             path.join(this.appDataPath, 'Goldberg SteamEmu Saves'),
//             path.join(this.appDataPath, 'Steam/CODEX'),
//             path.join(this.programDataPath, 'Steam') + '/*',
//             path.join(this.localAppDataPath, 'SKIDROW'),
//             path.join(this.appDataPath, 'SmartSteamEmu'),
//             path.join(this.appDataPath, 'CreamAPI')
//         ];
//
//         const DocsFolderPath: string = await regedit.promises.RegQueryStringValue('HKCU',
//             'Software/Microsoft/Windows/CurrentVersion/Explorer/User Shell Folders', 'Personal');
//         if (DocsFolderPath) {
//             foldersToScan = foldersToScan.concat([
//                 path.join(DocsFolderPath, 'Skidrow')
//             ]);
//         }
//
//         if (additionalFoldersToScan.length > 0) {
//             foldersToScan = foldersToScan.concat(additionalFoldersToScan);
//         }
//
//         foldersToScan = foldersToScan.map((dir) => {
//             return normalize(dir) + '/([0-9]+)';
//         });
//
//         return foldersToScan;
//     }
// }
//
// // export = {scan, scanLegit, getGameData, getAchievementsFromFile, getAchievementsFromAPI};
// export = {SteamParser};
//
// TODO DRAFT HERE
//
// // TODO LEGIT
// async scanLegitSteam(listingType: 0 | 1 | 2 = 0): Promise<ScanResult[]> {
//     const gamesMetadata: ScanResult[] = [];
//
//     if (regedit.RegKeyExists('HKCU', 'Software/Valve/Steam') && listingType > 0) {
//         const steamPath = await this.getSteamPath();
//         const steamCache = path.join(steamPath, 'appcache/stats');
//         const publicUsers = await this.getSteamUsers(steamPath);
//
//         const legitGamesList: ILegitSteamGameMetadata[] = (await glob('UserGameStats_*([0-9])_*([0-9]).bin', {
//             cwd: steamCache,
//             onlyFiles: true,
//             absolute: false
//         })).map((filename: string) => {
//             const matches: RegExpMatchArray = <RegExpMatchArray>filename.match(/([0-9]+)/g);
//             return {
//                 userId: matches[0],
//                 appId: matches[1]
//             };
//         });
//
//         for (let game of legitGamesList) {
//             let isInstalled = true;
//             if (listingType == 1) {
//                 isInstalled = (await regedit.promises.RegQueryIntegerValue('HKCU',
//                     `Software/Valve/Steam/Apps/${game.appId}`, 'Installed') === '1');
//             }
//             const user: SteamUser = <SteamUser> publicUsers.find(user => user.user == game.userId);
//
//             if (user && isInstalled) {
//                 gamesMetadata.push({
//                     appId: game.appId,
//                     source: `Steam (${user.name})`,
//                     data: {
//                         type: 'steamAPI',
//                         userId: user,
//                         cachePath: steamCache
//                     }
//                 });
//             }
//         }
//     } else {
//         throw 'Legit Steam not found or disabled.';
//     }
//
//     return gamesMetadata;
// }
//
// // TODO LEGIT
// async getAchievementsFromAPI(cfg) {
//
//     try {
//
//         let result;
//
//         let cache = {
//             local: path.join(this.achievementWatcherRootPath, 'steam_cache/user', cfg.user.user, `${cfg.appId}.db`),
//             steam: path.join(`${cfg.path}`, `UserGameStats_${cfg.user.user}_${cfg.appId}.bin`)
//         };
//
//         let time = {
//             local: 0,
//             steam: 0
//         };
//
//         let local = await ffs.promises.stats(cache.local);
//         if (Object.keys(local).length > 0) {
//             time.local = moment(local.mtime).valueOf();
//         }
//
//         let steamStats = await ffs.promises.stats(cache.steam);
//         if (Object.keys(steamStats).length > 0) {
//             time.steam = moment(steamStats.mtime).valueOf();
//         } else {
//             throw 'No Steam cache file found';
//         }
//
//         if (time.steam > time.local) {
//             if (cfg.key) {
//                 result = await getSteamUserStats(cfg);
//             } else {
//                 result = await getSteamUserStatsFromSRV(cfg.user.id, cfg.appId);
//             }
//             ffs.promises.writeFile(cache.local, JSON.stringify(result, null, 2)).catch((err) => {
//             });
//
//         } else {
//             result = JSON.parse(await ffs.promises.readFile(cache.local));
//         }
//
//         return result;
//
//     } catch (err) {
//         throw 'Could not load Steam User Stats.';
//     }
//
// }
//
//
//
// private async getSteamPath() {
//     /*
//       Some SteamEmu change HKCU/Software/Valve/Steam/SteamPath to the game's dir
//       Fallback to Software/WOW6432Node/Valve/Steam/InstallPath in this case
//       NB: Steam client correct the key on startup
//     */
//
//     const regHives = [
//         {root: 'HKCU', key: 'Software/Valve/Steam', name: 'SteamPath'},
//         {root: 'HKLM', key: 'Software/WOW6432Node/Valve/Steam', name: 'InstallPath'}
//     ];
//
//     let steamPath;
//
//     for (let regHive of regHives) {
//
//         steamPath = await regedit.promises.RegQueryStringValue(regHive.root, regHive.key, regHive.name);
//         if (steamPath) {
//             if (await ffs.promises.exists(path.join(steamPath, 'steam.exe'))) {
//                 break;
//             }
//         }
//     }
//
//     if (!steamPath) {
//         throw 'Steam Path not found';
//     }
//     return steamPath;
// }
//
// private async getSteamUsers(steamPath: string): Promise<SteamUser[]> {
//     const steamUsers: SteamUser[] = [];
//
//     let users = await regedit.promises.RegListAllSubkeys('HKCU', 'Software/Valve/Steam/Users');
//     if (!users) {
//         users = await glob('*([0-9])', {
//             cwd: path.join(steamPath, 'userdata'),
//             onlyDirectories: true,
//             absolute: false
//         });
//     }
//
//     if (users.length == 0) {
//         throw 'No Steam User ID found';
//     }
//     for (const user of users) {
//         const id = steamID.to64(user);
//         const data = await steamID.whoIs(id);
//
//         if (data.privacyState === 'public') {
//             console.log(`${user} - ${id} (${data.steamID}) is public`);
//             steamUsers.push({
//                 user: user,
//                 id: id,
//                 name: data.steamID
//             });
//         } else {
//             console.log(`${user} - ${id} (${data.steamID}) is not public`);
//         }
//     }
//
//     if (steamUsers.length > 0) {
//         return steamUsers;
//     } else {
//         throw 'Public profile: none.';
//     }
// }
//
// getSteamUserStatsFromSRV(user, appId) {
//
//     const url = `https://api.xan105.com/steam/user/${user}/stats/${appId}`;
//
//     return new Promise((resolve, reject) => {
//
//         request.getJson(url).then((data) => {
//
//             if (data.error) {
//                 return reject(data.error);
//             } else if (data.data) {
//                 return resolve(data.data);
//             } else {
//                 return reject('Unexpected Error');
//             }
//
//         }).catch((err) => {
//             return reject(err);
//         });
//
//     });
// }
//
// async getSteamUserStats(cfg) {
//
//     const url = `http://api.steampowered.com/SteamUserStats/GetPlayerAchievements/v0001/?appId=${cfg.appId}&key=${cfg.key}&steamid=${cfg.user.id}"`;
//
//     try {
//
//         let result = await request.getJson(url);
//         return result.playerstats.achievements;
//
//     } catch (err) {
//         throw err;
//     }

}

export {Steam};

