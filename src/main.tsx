import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { isNativeApp } from "@/services/nativePlugins";

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
	if (isNativeApp()) {
		void navigator.serviceWorker.getRegistrations().then((registrations) => {
			for (const registration of registrations) {
				void registration.unregister();
			}
		});
	} else {
		void navigator.serviceWorker.register("/sw.js");
	}
}

createRoot(document.getElementById("root")!).render(<App />);
