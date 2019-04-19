import {
	Steps,
	steps,
	enableHotReload,
	runExportedSteps,
	registerUpdateReconciler,
} from "../../dist";
import puppeteer = require("puppeteer");

enableHotReload();
registerUpdateReconciler(module);
runExportedSteps(module, getSteps);

export function getSteps(): Steps {
	return steps(
		{
			id: "Setup",
			do: async (args, { onUndo }) => {
				const browser = await puppeteer.launch({
					slowMo: 10,
					devtools: true,
					headless: false,
					args: ["--lang=en-US,en"],
				});
				const page = await browser.newPage();

				onUndo(() => browser.close());

				return {
					browser,
					page,
				};
			},
		},
		{
			id: "Login",
			do: async args => {
				const page = args.page;
				await page.goto("https://demo.moodle.net/login/index.php");
				await page.type("#username", "admin");
				await page.type("#password", "sandbox");
				await page.$eval("#login", form =>
					(form as HTMLFormElement).submit()
				);

				return args;
			},
		},
		{
			id: "OpenCalendarAndOpenNewEvent",
			do: async args => {
				const page = args.page;
				await page.goto(
					"https://demo.moodle.net/calendar/view.php?view=month"
				);
				await page.click("[data-action='new-event-button']");
				return args;
			},
		},
		{
			id: "FillNewEventData",
			do: async args => {
				const page = args.page;
				await page.waitFor("#id_name");
				await page.click("#id_name", { clickCount: 3 });
				await page.type("#id_name", "Dummy Event");
				await page.type("#id_timestart_day", "17");
				await page.type("#id_timestart_month", "Jan");
				return args;
			},
		},
		{
			id: "SaveNewEventData",
			do: async args => {
				const page = args.page;
				await page.click("[data-action='save']");
				return args;
			},
		}
	);
}
