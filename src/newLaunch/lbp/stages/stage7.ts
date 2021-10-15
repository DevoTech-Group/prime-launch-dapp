import { ITokenDetails } from "./../../launchConfig";
import { ILbpConfig } from "newLaunch/lbp/config";
import { EthereumService } from "services/EthereumService";
import { autoinject, computedFrom } from "aurelia-framework";
import { BaseStage } from "newLaunch/baseStage";
import { Router, RouteConfig, Redirect } from "aurelia-router";
// import { LbpService } from "services/LbpService";
import { EventAggregator } from "aurelia-event-aggregator";
import { EventConfigException } from "services/GeneralEvents";
// import { fromWei } from "services/EthereumService";
import { NumberService } from "services/NumberService";
import { TokenService } from "services/TokenService";

@autoinject
export class Stage7 extends BaseStage<ILbpConfig> {

  constructor(
    router: Router,
    eventAggregator: EventAggregator,
    // private lbpService: LbpService,
    private ethereumService: EthereumService,
    tokenService: TokenService,
    private numberService: NumberService) {
    super(router, eventAggregator, tokenService);
  }

  public async canActivate(_params: unknown, routeConfig: RouteConfig): Promise<boolean | Redirect> {
    /**
     * heuristic for whether we have data.  Possibility is that the user
     * has used the 'back' button or otherwize figured out how to return
     * to this page, for example, just after having submitting a Seed,
     * where the launchConfig will have been deleted.
     */
    if (!routeConfig.settings.launchConfig.general.projectName?.length) {
      return new Redirect("");
    } else {
      return true;
    }
  }

  attached(): void {
    // this.launchConfig.launchDetails.fundingMax = toWei("100").toString();
    // this.launchConfig.launchDetails.pricePerToken = toWei(".5").toString();
    // this.launchConfig.tokenDetails.projectTokenConfig.symbol = "PRIME";
    // const distributableSeeds = this.numberService.fromString(fromWei(this.launchConfig.launchDetails.fundingMax, this.wizardState.fundingTokenInfo.decimals))
    //   / this.numberService.fromString(fromWei(this.launchConfig.launchDetails.pricePerToken, this.wizardState.fundingTokenInfo.decimals));
    // this.wizardState.requiredLaunchFee = distributableSeeds * this.launchFee;
    // this.wizardState.requiredSeedDeposit = distributableSeeds + this.wizardState.requiredLaunchFee;
  }

  // props:ITokenDetails = {
  //   maxSupply: "100000000000000000000",
  //   tokenDistrib: [{
  //     amount: "20000000000000000000",
  //     cliff: 10,
  //     stakeHolder: "test 1",
  //     vest: 20,
  //   }, {
  //     amount: "33000000000000000000",
  //     cliff: 12,
  //     stakeHolder: "test 2 ",
  //     vest: 357,
  //   }],
  // }

  async submit(): Promise<void> {
    console.log("this.launchConfig", this.launchConfig, this.wizardState);
    console.log("this.launchConfig.launchDetails", this.launchConfig.launchDetails.amountFundingToken, this.launchConfig.launchDetails.amountProjectToken);
    console.log("object", this.launchConfig.tokenDetails.maxSupply);
    //     [{
    //   amount: "20000000000000000000"
    //
    // cliff: "10"
    //
    // stakeHolder: "test 1"
    //
    // vest: "20"
    // },{
    //   amount: "33000000000000000000"
    //
    // cliff: "12"
    //
    // stakeHolder: "test 2 "
    //
    // vest: "357"
    // }]

    try {
      this.eventAggregator.publish("seed.creating", true);
      // this.wizardState.launchHash = await this.lbpService.deployLbp(this.launchConfig);
      if (this.wizardState.launchHash) {
      // this.eventAggregator.publish("handleInfo", `Successfully pinned seed registration hash at: this.ipfsService.getIpfsUrl(this.launchHash)`);
        this.launchConfig.clearState();
        for (let i = 1; i <= this.maxStage; ++i) {
          this.stageStates[i].verified = false;
        }
        this.eventAggregator.publish("seed.clearState", true);
        this.next();
      }
    } catch (ex) {
      this.eventAggregator.publish("handleException", new EventConfigException("Sorry, an error occurred", ex));
    }
    finally {
      this.eventAggregator.publish("seed.creating", false);
    }
  }

  @computedFrom("ethereumService.defaultAccountAddress")
  get connected(): boolean { return !!this.ethereumService.defaultAccountAddress;}

  connect(): void {
    this.ethereumService.ensureConnected();
  }
}
