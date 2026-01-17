import { Classic } from "@caido/primevue";
import { createPinia } from "pinia";
import PrimeVue from "primevue/config";
import { createApp, defineComponent } from "vue";

import { Configuration } from "./components/Configuration";
import { SDKPlugin } from "./plugins/sdk";
import "./styles/index.css";
import type { FrontendSDK } from "./types";

export const init = (sdk: FrontendSDK) => {
  const app = createApp(defineComponent({}));
  const pinia = createPinia();

  app.use(PrimeVue, {
    unstyled: true,
    pt: Classic,
  });
  app.use(pinia);
  app.use(SDKPlugin, sdk);

  // Register settings in Caido Settings -> Plugins section
  sdk.settings.addToSlot("plugins-section", {
    type: "Custom",
    name: "Crawler",
    definition: { component: Configuration },
  });

  // Register context menu command for manual crawl
  sdk.commands.register("crawl-url", {
    name: "Crawl Host",
    run: async (context) => {
      switch (context.type) {
        case "RequestRowContext": {
          const requests = context.requests;
          if (requests.length === 0) {
            sdk.window.showToast("No requests selected", { variant: "error" });
            return;
          }

          const origins = new Set<string>();
          for (const req of requests) {
            const protocol = req.isTls ? "https" : "http";
            const defaultPort = req.isTls ? 443 : 80;
            const portStr = req.port === defaultPort ? "" : `:${req.port}`;
            origins.add(`${protocol}://${req.host}${portStr}`);
          }

          let started = 0;
          for (const origin of origins) {
            const result = await sdk.backend.startCrawl(origin);
            if (result.kind === "Ok") {
              started++;
            }
          }

          if (started > 0) {
            sdk.window.showToast(
              `Started crawling ${started} host${started === 1 ? "" : "s"}`,
              { variant: "success" },
            );
          } else {
            sdk.window.showToast("Failed to start crawl", { variant: "error" });
          }
          break;
        }

        case "RequestContext": {
          const req = context.request;

          const protocol = req.isTls ? "https" : "http";
          const defaultPort = req.isTls ? 443 : 80;
          const portStr = req.port === defaultPort ? "" : `:${req.port}`;
          const origin = `${protocol}://${req.host}${portStr}`;

          const result = await sdk.backend.startCrawl(origin);
          if (result.kind === "Ok") {
            sdk.window.showToast(`Started crawling ${result.value.host}`, {
              variant: "success",
            });
          } else {
            sdk.window.showToast(result.error, { variant: "error" });
          }
          break;
        }

        default:
          break;
      }
    },
  });

  // Register context menu items
  sdk.menu.registerItem({
    type: "RequestRow",
    commandId: "crawl-url",
    leadingIcon: "fas fa-spider",
  });

  sdk.menu.registerItem({
    type: "Request",
    commandId: "crawl-url",
    leadingIcon: "fas fa-spider",
  });
};
