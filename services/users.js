const { User } = require("../models/user");
const Contest = require("../models/contest");
const fetch = require("node-fetch");

const BASE_URL = "https://leetcode.com";
const BASE_CN_URL = "https://leetcode-cn.com";
const { getUserId } = require("../helpers");

async function fetchUserDataUSRegion(username, retries = 4, updateDB = true) {
    try {
        let attendedContestsCount,
            rating,
            globalRanking,
            user_id = getUserId(username, "US");
        var resp = await fetch(BASE_URL + "/graphql", {
            headers: {
                accept: "*/*",
                "accept-language":
                    "en-GB,en-US;q=0.9,en;q=0.8,hi;q=0.7,ru;q=0.6",
                "cache-control": "no-cache",
                "content-type": "application/json",
                pragma: "no-cache",
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua":
                    '" Not;A Brand";v="99", "Google Chrome";v="91", "Chromium";v="91"',
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin",
                "sec-gpc": "1",
            },
            referrer: "https://leetcode.com/",
            referrerPolicy: "strict-origin-when-cross-origin",
            body: `{"operationName":"getContestRankingData","variables":{"username":"${username}"},"query":"query getContestRankingData($username: String!) {\
                userContestRanking(username: $username) {\
                attendedContestsCount\
                rating\
                globalRanking\
                }\
            }\
            "}`,
            method: "POST",
            mode: "cors",
        });

        if (resp.status != 200) {
            if (retries > 0) {
                const res = await fetchUserDataUSRegion(
                    username,
                    retries - 1,
                    updateDB
                );
                return res;
            }
            return [null, new Error(resp.statusText)];
        }

        resp = await resp.json();
        if (resp.errors || !resp.data) {
            return [
                {
                    rating: -1,
                    isFirstContest: false,
                },
                null,
            ];
        }

        ranking = resp.data.userContestRanking;
        if (ranking) {
            attendedContestsCount = ranking.attendedContestsCount;
            rating = ranking.rating;
            globalRanking = ranking.globalRanking;
        } else {
            rating = 1500;
            attendedContestsCount = 0;
        }
        const result = {
            rating: rating,
            isFirstContest: attendedContestsCount === 0,
        };
        if (!updateDB) {
            return [result, null];
        }
        let user = await User.findById(user_id, { _id: 1 });
        const exists = user != null;
        if (!exists) {
            user = new User({ _id: user_id });
        }
        user.attendedContestsCount = attendedContestsCount;
        user.rating = rating;
        user.globalRanking = globalRanking;
        user.lastUpdated = Date.now();
        await user.save();

        return [result, null];
    } catch (err) {
        if (retries > 0) {
            const res = await fetchUserDataUSRegion(
                username,
                retries - 1,
                updateDB
            );
            return res;
        }
        return [null, err];
    }
}

async function fetchUserDataCNRegion(username, retries = 4, updateDB = true) {
    try {
        let attendedContestsCount,
            rating,
            globalRanking,
            user_id = getUserId(username, "CN");
        let resp = await fetch(BASE_CN_URL + "/graphql/", {
            headers: {
                accept: "*/*",
                "accept-language": "en",
                "cache-control": "no-cache",
                "content-type": "application/json",
                pragma: "no-cache",
                "sec-ch-ua": `" Not;A Brand";v="99", "Google Chrome";v="91", "Chromium";v="91"`,
                "sec-ch-ua-mobile": "?0",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin",
                "sec-gpc": "1",
                "x-definition-name": "userProfilePublicProfile",
                "x-operation-name": "userPublicProfile",
            },
            referrer: "https://leetcode-cn.com",
            referrerPolicy: "strict-origin-when-cross-origin",
            body: `{"operationName":"userPublicProfile","variables":{"userSlug":"${username}"},"query":"query userPublicProfile($userSlug: String!) {\
            userProfilePublicProfile(userSlug: $userSlug) {\
              username\
              siteRanking\
              profile {\
                userSlug\
                contestCount\
                ranking {\
                  rating\
                  currentLocalRanking\
                  currentGlobalRanking\
                  currentRating\
                  totalLocalUsers\
                  totalGlobalUsers\
                }\
              }\
            }\
          }\
          "}`,
            method: "POST",
            mode: "cors",
        });

        if (resp.status != 200) {
            if (retries > 0) {
                const res = await fetchUserDataCNRegion(
                    username,
                    retries - 1,
                    updateDB
                );
                return res;
            }
            return [null, new Error(resp.statusText)];
        }

        resp = await resp.json();

        if (
            resp.errors ||
            !resp.data ||
            !resp.data.userProfilePublicProfile ||
            !resp.data.userProfilePublicProfile.profile
        ) {
            return [
                {
                    rating: -1,
                    isFirstContest: false,
                },
                null,
            ];
        }

        let profile = resp.data.userProfilePublicProfile.profile;
        attendedContestsCount = parseInt(profile.contestCount);
        if (attendedContestsCount > 0) {
            let ranking = profile.ranking;
            globalRanking = ranking.currentGlobalRanking;
            rating = parseFloat(ranking.currentRating);
        } else rating = 1500;

        const result = {
            isFirstContest: attendedContestsCount === 0,
            rating: rating,
        };
        if (!updateDB) {
            return [result, null];
        }
        let user = await User.findById(user_id, { _id: 1 });
        const exists = user != null;
        if (!exists) {
            user = new User({ _id: user_id });
        }
        user.attendedContestsCount = attendedContestsCount;
        user.rating = rating;
        user.globalRanking = globalRanking;
        user.lastUpdated = Date.now();
        await user.save();
        return [result, null];
    } catch (err) {
        if (retries > 0) {
            const res = await fetchUserDataCNRegion(
                username,
                retries - 1,
                updateDB
            );
            return res;
        }
        return [null, err];
    }
}

const fetchUserInfo = async (username, dataRegion = "US") => {
    if (dataRegion === "CN") {
        const [result, err] = await fetchUserDataCNRegion(username);
        return [result, err];
    } else {
        const [result, err] = await fetchUserDataUSRegion(username);
        return [result, err];
    }
};

const getCurrentRating = async (
    username,
    dataRegion = "US",
    checkInDB = true
) => {
    const user_id = getUserId(username, dataRegion);
    let result = {
        isFirstContest: false,
        rating: -1,
    };
    try {
        let user;
        if (checkInDB) {
            user = await User.findById(user_id, { contestsHistory: 0 });
        }
        if (user) {
            result.isFirstContest = user.attendedContestsCount === 0;
            result.rating = user.rating;
        } else {
            const [userInfo, err] = await fetchUserInfo(username, dataRegion);
            if (err) {
                console.log(`Failed to fetch: ${user_id}`);
                result.error = err;
            } else {
                if (userInfo) {
                    result = userInfo;
                }
            }
        }
    } catch (err) {
        result.error = err;
        return result;
    }
    return result;
};

// fetches data required for predictions
const getContestParticipantsData = async (contest) => {
    try {
        if (!contest || !contest.rankings) {
            return [];
        }
        let total = contest.rankings.length;
        let result = new Array(total),
            failed = [];
        let limit = 500;

        const getCurrentRatingHelper = async (index, isFailed = false) => {
            let userData = await getCurrentRating(
                contest.rankings[index].user_slug,
                contest.rankings[index].data_region,
                !isFailed
            );
            result[index] = userData;
            if (userData.error) {
                failed.push(index);
            }
        };
        const getPercentage = (done, total) => {
            if (total <= 0) {
                return -1;
            }
            return Math.round(((done * 100) / total) * 100) / 100;
        };
        for (let i = 0; i < total; i += limit) {
            let promises = [];
            for (let j = 0; j < limit && i + j < total; j++) {
                promises.push(getCurrentRatingHelper(i + j));
            }
            await Promise.all(promises);
            console.info(
                `users fetched: ${i + limit} (${getPercentage(
                    Math.min(i + limit, total),
                    total
                )}%)`
            );
        }
        let failedRanks;
        const retry = async (limit) => {
            console.log("Total failed: ", failedRanks.length, "limit: ", limit);
            for (let i = 0; i < failedRanks.length; i += limit) {
                let promises = [];
                for (let j = 0; j < limit && i + j < failedRanks.length; j++) {
                    promises.push(
                        getCurrentRatingHelper(failedRanks[i + j], true)
                    );
                }
                await Promise.all(promises);
                console.info(
                    `users fetched: ${i + limit} (${getPercentage(
                        Math.min(i + limit, total),
                        total
                    )}%)`
                );
            }
        };

        const limits = [100, 20, 10, 5];
        for (let i = 0; i < 10; i++) {
            limits.push(1);
        }

        for (limit of limits) {
            if (failed.length === 0) {
                break;
            }
            failedRanks = failed;
            failed = [];
            await retry(limit);
        }
        if (failed.length) {
            console.log("Unable to fetch these ranks: ", failed);
            return [];
        }
        contest.users_fetched = true;
        await contest.save();
        return result;
    } catch (err) {
        console.error(err);
        return [];
    }
};

const updateUsers = async (job) => {
    try {
        let offset = job.data.offset;
        let limit = job.data.limit;
        const users = await User.find({}, { lastUpdated: 1 })
            .skip(offset)
            .limit(limit);
        if (!users) {
            return;
        }

        const rateLimit = job.data.rateLimit;
        const total = users.length;

        const failed = [];
        const totalSuccess = 0;
        const fetchUserHelper = async (user) => {
            const [data_region, username] = users[i]._id.split("/");
            const [result, err] = await fetchUserInfo(username, data_region);
            if (err) {
                failed.push(user);
            } else {
                totalSuccess++;
            }
        };

        for (let i = 0; i < total; i++) {
            let promises = [];
            for (let j = 0; j < rateLimit && i + j < total; j++) {
                if (
                    Date.now() - users[i + j].lastUpdated <
                    12 * 60 * 60 * 1000
                ) {
                    continue;
                }
                promises.push(fetchUserHelper(users[i + j]));
            }
            await Promise.all(promises);
            job.progress((totalSuccess * 100) / total);
        }
        for (user in failed) {
            await fetchUserHelper(user);
            job.progress((totalSuccess * 100) / total);
        }
        if (failed.length > 0) {
            console.log(`Failed to fetch ${failed.length} users.`);
        }
    } catch (err) {
        return err;
    }
};

exports.getContestParticipantsData = getContestParticipantsData;
exports.fetchUserInfo = fetchUserInfo;
exports.updateUsers = updateUsers;
