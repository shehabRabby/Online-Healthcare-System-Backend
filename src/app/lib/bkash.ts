import httpStatus from "http-status";
import config from "../config";
import { AppError } from "../utils/AppError";
import { redisClient } from "./redis";

export const getBkashIdToken = async () => {
  try {
    const IdTokenKey = "bkash:idToken";
    const RefreshToken = "bkash:refreshToken";

    let bkashIdToken = await redisClient.get(IdTokenKey);
    const bkashIdTokenTTL = await redisClient.ttl(IdTokenKey);
    const bkashRefreshToken = await redisClient.get(RefreshToken);
    const bkashRefreshTokenTTL = await redisClient.ttl(RefreshToken);

    // console.log({
    //   bkashIdToken,
    //   bkashIdTokenTTL,
    //   bkashRefreshToken,
    //   bkashRefreshTokenTTL,
    // });

    //if the bkash id token remaining is less than 10 minutes
    //refresh token is available and refresh token remaining is more than 10 minutes then refresh the id token
    if (
      (bkashIdTokenTTL <= 600 || !bkashIdToken) &&
      bkashRefreshToken &&
      bkashRefreshTokenTTL > 600
    ) {
      const refreshTokenresponse = await fetch(
        `${config.bkash_base_url}/tokenized/checkout/token/refresh`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            username: config.bkash_username,
            password: config.bkash_password,
          },
          body: JSON.stringify({
            app_key: config.bkash_app_key,
            app_secret: config.bkash_app_secret,
            refresh_token: bkashRefreshToken,
          }),
        },
      );

      if (!refreshTokenresponse.ok) {
        throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to get bKash Access ID token");
      }

      const bkashRefreshTokenResult = await refreshTokenresponse.json();

      bkashIdToken = bkashRefreshTokenResult.id_token as string;

      await redisClient.set(IdTokenKey, bkashIdToken, {
        expiration: {
          type: "EX",
          value: 60 * 60,
        },
      });
      return bkashIdToken;
    }

    if (bkashIdTokenTTL > 600) {
      return bkashIdToken;
    }

    const response = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/token/grant`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          username: config.bkash_username,
          password: config.bkash_password,
        },
        body: JSON.stringify({
          app_key: config.bkash_app_key,
          app_secret: config.bkash_app_secret,
        }),
      },
    );

    if (!response.ok) {
      throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to get bKash Access ID token");
    }

    const result = await response.json();

    // bkash id token set here
    await redisClient.set(IdTokenKey, result.id_token, {
      expiration: {
        type: "EX",
        value: 60 * 60,
      },
    });

    //bkash refresh token set here
    await redisClient.set(RefreshToken, result.refresh_token, {
      expiration: {
        type: "EX",
        value: 60 * 60 * 24 * 28, //28 days
      },
    });
    bkashIdToken = result.id_token;

    return bkashIdToken;
  } catch (error: any) {
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};
