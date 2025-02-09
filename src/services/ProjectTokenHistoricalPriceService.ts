import { fromWei } from "./EthereumService";
import { EthereumService, Networks } from "services/EthereumService";

import { DateService } from "services/DateService";
import { NumberService } from "services/NumberService";
import { TokenService } from "services/TokenService";
import { LbpManager } from "entities/LbpManager";
import { LbpProjectTokenPriceService } from "./LbpProjectTokenPriceService";
import { Lbp } from "entities/Lbp";

import { jsonToGraphQLQuery } from "json-to-graphql-query";
import axios from "axios";
import { autoinject } from "aurelia-framework";

interface ISwapRecord {
  timestamp: number,
  tokenAmountIn: string,
  tokenAmountOut: string,
}

export interface IHistoricalPriceRecord { time: number, price?: number }

@autoinject
export class ProjectTokenHistoricalPriceService {
  private historicalPrices = new Array<IHistoricalPriceRecord>();

  constructor(
    private dateService: DateService,
    private tokenService: TokenService,
    private lbpProjectTokenPriceService: LbpProjectTokenPriceService,
    private ethereumService: EthereumService,
    private numberService: NumberService,
  ) {
  }

  private getBalancerSubgraphUrl(): string {
    return `https://api.thegraph.com/subgraphs/name/balancer-labs/balancer${this.ethereumService.targetedNetwork === Networks.Rinkeby ? "-rinkeby-v2" : "-v2"}`;
  }

  private getCoingeckoUrl(fundingTokenId: string, startTime: number, endTime: number): string {
    return `https://api.coingecko.com/api/v3/coins/${fundingTokenId}/market_chart/range?vs_currency=usd&from=${startTime}&to=${endTime}`;
  }

  public async getPricesHistory(lbpMgr: LbpManager): Promise<Array<IHistoricalPriceRecord>> {
    if (!lbpMgr.lbp || !lbpMgr.lbp.poolId) {
      return [];
    }

    const startingSeconds = lbpMgr.startTime.getTime() / 1000;
    const intervalMinutes = 60/*min*/;
    const intervalSeconds = intervalMinutes * 60/* sec */;
    const startTime = (Math.floor(startingSeconds / intervalSeconds) * intervalSeconds)/* Rounded */;
    /* Rounded to the nearest hour */
    const endTimeSeconds = Math.floor(new Date().getTime() / 1000 / intervalSeconds) * intervalSeconds + intervalSeconds; // rounded hour


    /**
     * subgraph will return a maximum of 1000 records at a time.  so for a very active pool,
     * in a single query you can potentially obtain data for only a small slice of calendar time.
     *
     * So we fetch going backwards from today, 1000 at a time, until we've got all the records.
     */
    let swaps = new Array<ISwapRecord>();
    let fetched: Array<ISwapRecord>;
    do {
      /**
       * fetchSwaps returns swaps in descending time order, so the last one will be
       * the earliest one.
       */
      fetched = await this.fetchSwaps(endTimeSeconds, startingSeconds, lbpMgr.lbp);
      swaps = swaps.concat(fetched);
    } while (fetched.length === 1000);

    const returnArray = new Array<IHistoricalPriceRecord>();

    const startFundingTokenAmount = this.numberService.fromString(fromWei(lbpMgr.startingFundingTokenAmount, lbpMgr.fundingTokenInfo.decimals));
    const startProjectTokenAmount = this.numberService.fromString(fromWei(lbpMgr.startingProjectTokenAmount, lbpMgr.projectTokenInfo.decimals));

    swaps.push({
      timestamp: startTime,
      tokenAmountIn: (startFundingTokenAmount / (1 - lbpMgr.projectTokenStartWeight)).toString(),
      tokenAmountOut: (startProjectTokenAmount / (lbpMgr.projectTokenStartWeight)).toString(),
    } as ISwapRecord);

    if (swaps.length) {
      let previousTimePoint;

      swaps.reverse(); // to ascending

      const prices = await axios.get(
        this.getCoingeckoUrl(
          lbpMgr.fundingTokenInfo.id,
          swaps[0].timestamp - Math.round(60 / intervalMinutes * 1000/*hour back*/),
          endTimeSeconds,
        ),
      );

      const fundingTokenPricesUSD = prices?.data?.prices?.map(price => {
        return {
          timestamp: Math.floor(price[0] / (intervalSeconds * 1000)) * (intervalSeconds),
          priceInUSD: price[1],
        };
      }) || [{ timestamp: 0, priceInUSD: 0 }];

      /**
       * enumerate every day
       */
      for (let timestamp = startTime; timestamp <= endTimeSeconds - intervalSeconds; timestamp += intervalSeconds) {

        const todaysSwaps = new Array<ISwapRecord>();
        const nextInterval = timestamp + intervalSeconds;

        if (swaps.length) {
        // eslint-disable-next-line no-constant-condition
          while (true) {
            const swap = swaps[0];
            if (swap.timestamp >= nextInterval) {
              break;
            }
            else if (swap.timestamp >= timestamp) {
              todaysSwaps.push(swap);
              swaps.shift();
              if (!swaps.length) {
                break;
              }
            } // swap.timestamp < timestamp
          }
        }

        const timezoneOffset = new Date().getTimezoneOffset() * 60;
        const priceAtTimePoint = fundingTokenPricesUSD.filter(price => price.timestamp <= timestamp );


        if (todaysSwaps?.length) {
          returnArray.push({
            time: timestamp - timezoneOffset + intervalSeconds/* Apply to the next interval in users timezone */,
            price: (
              this.numberService.fromString(todaysSwaps[todaysSwaps.length-1].tokenAmountIn) /
              this.numberService.fromString(todaysSwaps[todaysSwaps.length-1].tokenAmountOut) *
              priceAtTimePoint[priceAtTimePoint.length-1].priceInUSD
            ),
          });
          previousTimePoint = (
            this.numberService.fromString(todaysSwaps[todaysSwaps.length-1].tokenAmountIn) /
            this.numberService.fromString(todaysSwaps[todaysSwaps.length-1].tokenAmountOut)
          );
        } else if (previousTimePoint) {
          /**
           * previous value effected by USD course change
           */
          returnArray.push({
            time: timestamp - timezoneOffset + intervalSeconds/* Apply to the next interval in users timezone */,
            price: (
              previousTimePoint *
              priceAtTimePoint[priceAtTimePoint.length-1].priceInUSD
            ),
          });
        } else {
          returnArray.push({
            time: timestamp - timezoneOffset + intervalSeconds/* Apply to the next interval in users timezone */,
          });
        }
      }
    }
    return returnArray;
  }

  private fetchSwaps(endDateSeconds: number, startDateSeconds: number, lbp: Lbp): Promise<Array<ISwapRecord>> {
    const uri = this.getBalancerSubgraphUrl();
    const query = {
      swaps: {
        __args: {
          first: 1000,
          orderBy: "timestamp",
          orderDirection: "desc",
          where: {
            poolId: lbp.poolId.toLowerCase(),
            timestamp_gte: startDateSeconds,
            timestamp_lte: endDateSeconds,
          },
        },
        timestamp: true,
        tokenAmountIn: true,
        tokenAmountOut: true,
      },
    };

    return axios.post(uri,
      JSON.stringify({ query: jsonToGraphQLQuery({ query }) }),
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      })
      .then(async (response) => {
        if (response.data.errors?.length) {
          throw new Error(response.data.errors[0]);
        }
        return response.data?.data.swaps;
      })
      .catch((error) => {
        throw new Error(`${error.response?.data?.error.message ?? "Error fetching price history"}`);
        return [];
      });
  }
}
