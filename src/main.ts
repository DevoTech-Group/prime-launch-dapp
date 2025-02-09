import { PinataIpfsClient } from "./services/PinataIpfsClient";
import { Aurelia } from "aurelia-framework";
import * as environment from "../config/environment.json";
import { PLATFORM } from "aurelia-pal";
import { AllowedNetworks, EthereumService, Networks } from "services/EthereumService";
import { EventConfigException } from "services/GeneralEvents";
import { ConsoleLogService } from "services/ConsoleLogService";
import { ContractsService } from "services/ContractsService";
import { EventAggregator } from "aurelia-event-aggregator";
import { SeedService } from "services/SeedService";
import { IpfsService } from "services/IpfsService";
import { GeoBlockService } from "services/GeoBlockService";
import { HTMLSanitizer } from "aurelia-templating-resources";
import DOMPurify from "dompurify";
import { TokenService } from "services/TokenService";
import { ContractsDeploymentProvider } from "services/ContractsDeploymentProvider";
import { LbpManagerService } from "services/LbpManagerService";
import { Seed } from "entities/Seed";
import { LbpManager } from "entities/LbpManager";
import { Lbp } from "entities/Lbp";
import { Vault } from "entities/Vault";
import { BalancerService } from "services/BalancerService";
import { LaunchService } from "services/LaunchService";

export function configure(aurelia: Aurelia): void {
  aurelia.use
    .standardConfiguration()
    .feature(PLATFORM.moduleName("resources/index"))
    .plugin(PLATFORM.moduleName("aurelia-animator-css"))
    .plugin(PLATFORM.moduleName("aurelia-dialog"), (configuration) => {
      // custom configuration
      configuration.settings.keyboard = false;
    });

  aurelia.use.singleton(HTMLSanitizer, DOMPurify);

  if (process.env.NODE_ENV === "development") {
    aurelia.use.developmentLogging(); // everything
  } else {
    aurelia.use.developmentLogging("warning"); // only errors and warnings
  }

  if (environment.testing) {
    aurelia.use.plugin(PLATFORM.moduleName("aurelia-testing"));
  }

  aurelia.start().then(async () => {
    aurelia.container.get(ConsoleLogService);
    try {
    /**
     * otherwise singleton is the default
     */
      aurelia.container.registerTransient(Seed);
      aurelia.container.registerTransient(LbpManager);
      aurelia.container.registerTransient(Lbp);
      aurelia.container.registerTransient(Vault);

      const ethereumService = aurelia.container.get(EthereumService);
      ethereumService.initialize(
        process.env.NETWORK as AllowedNetworks ??
          (process.env.NODE_ENV === "development" ? Networks.Rinkeby : Networks.Mainnet));

      ContractsDeploymentProvider.initialize(ethereumService.targetedNetwork);

      aurelia.container.get(ContractsService);

      const tokenService = aurelia.container.get(TokenService);
      await tokenService.initialize();

      const launchService = aurelia.container.get(LaunchService);
      launchService.initialize();

      const balancerService = aurelia.container.get(BalancerService);
      balancerService.initialize();

      const geoBlockService = aurelia.container.get(GeoBlockService);
      await geoBlockService.initialize();

      const ipfsService = aurelia.container.get(IpfsService);
      ipfsService.initialize(aurelia.container.get(PinataIpfsClient));

      const seedService = aurelia.container.get(SeedService);
      seedService.initialize();

      const lbpManagerService = aurelia.container.get(LbpManagerService);
      lbpManagerService.initialize();

    } catch (ex) {
      const eventAggregator = aurelia.container.get(EventAggregator);
      eventAggregator.publish("handleException", new EventConfigException("Error initializing the app", ex));
      alert(`Sorry, unable to initialize, possibly could not connect to ethereum: ${ex.message}`);
    }
    aurelia.setRoot(PLATFORM.moduleName("app"));
  });
}
