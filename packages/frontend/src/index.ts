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
    name: "Crawl URL",
    run: async (context) => {
      switch (context.type) {
        case "RequestRowContext": {
          const requests = context.requests;
          if (requests.length === 0) {
            sdk.window.showToast("No requests selected", { variant: "error" });
            return;
          }

          // Get unique hosts from selected requests
          const hosts = new Set<string>();
          for (const req of requests) {
            try {
              const url = new URL(req.host + req.path);
              hosts.add(url.origin);
            } catch {
              // Skip invalid URLs
            }
          }

          if (hosts.size === 0) {
            sdk.window.showToast("No valid URLs found", { variant: "error" });
            return;
          }

          // Start crawl for each unique host
          let started = 0;
          for (const host of hosts) {
            const result = await sdk.backend.startCrawl(host);
            if (result.kind === "Ok") {
              started++;
            }
          }

          if (started > 0) {
            sdk.window.showToast(
              `Started crawling ${started} host${started === 1 ? "" : "s"}`,
              { variant: "success" },
            );
          }
          break;
        }

        case "RequestContext": {
          const request = context.request;
          if (request.type !== "RequestFull") {
            sdk.window.showToast("Full request required", { variant: "error" });
            return;
          }

          try {
            const url = new URL(request.host + request.path);
            const result = await sdk.backend.startCrawl(url.origin);
            if (result.kind === "Ok") {
              sdk.window.showToast(`Started crawling ${result.value.host}`, {
                variant: "success",
              });
            } else {
              sdk.window.showToast(result.error, { variant: "error" });
            }
          } catch {
            sdk.window.showToast("Invalid URL", { variant: "error" });
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
