import { EthereumService } from "./EthereumService";
/* eslint-disable require-atomic-updates */
import { autoinject } from "aurelia-framework";
import { ConsoleLogService } from "services/ConsoleLogService";
import axios from "axios";
import { Address } from "services/EthereumService";
import { AxiosService } from "services/axiosService";

@autoinject
export class WhiteListService {

  constructor(
    private consoleLogService: ConsoleLogService,
    private ethereumService: EthereumService,
    private axiosService: AxiosService) {}

  private lists = new Map<string, Set<Address>>();

  public async getWhiteList(url: string): Promise<Set<Address>> {
    let list = this.lists.get(url);
    /**
     * note that the list can be null if it wasn't able to be obtained on a previous try
     */
    if (list === undefined) {
      list = await axios.get(url)
        .then((response) => {
          if (response.data) {
            /**
             * pulls all unique and valid addresses out of the file.  Ignores invalid addresses.
             */
            list = new Set(Array.from(response.data.matchAll(/(0x[a-zA-Z0-9]{40})\W?/g)).map(r => r[1]));
            this.consoleLogService.logMessage(`getWhiteList: found whitelist containing ${list.size} addresses at ${url}`, "info");
            this.lists.set(url, list);
            return list;
          } else {
            this.consoleLogService.logMessage("getWhiteList: something went wrong", "error");
            this.lists.set(url, null);
            return null;
          }
        })
        .catch((error) => {
          this.axiosService.axiosErrorHandler(error);
          this.lists.set(url, null);
          return null;
        });
    }
    return list;
  }

  /**
   * Returns only whether the account is in the whitelist file.  However, be aware that the
   * the account may no longer be in the whitelist according to the contract that was
   * initialized by the whitelist.
   *
   *****************
   * So you should not use this function to determine the user's whitelist status at runtime.
   *****************
   *
   * @param url the location of the file containing a list of addresses (see getWhiteList())
   * @param account optional, default is the current account
   * @returns true if account is whitelisted
   */
  public async isWhitelisted(url: string, account?: Address): Promise<boolean> {
    const list = await this.getWhiteList(url);
    return list ? list.has(account ?? this.ethereumService.defaultAccountAddress) : false;
  }
}
