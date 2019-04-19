import { DisposableComponent } from "@hediet/std/disposable";
import { EventEmitter } from "@hediet/std/events";
import { diffObjectsKeys } from "./utils";
import { StepData, StepState, Steps, Step } from "./steps";

export class Controller extends DisposableComponent {
	private lastRanStepIdx: number = -1;
	private currentSteps = new Array<StepData>();
	private stepStatesChangedEmitter = new EventEmitter<
		StepState[],
		Controller
	>();

	public readonly onStepStatesChanged = this.stepStatesChangedEmitter.asEvent();
	public getStepStates(): StepState[] {
		return this.currentSteps.map(s => ({ id: s.step.id, state: s.state }));
	}

	public async applyNewSteps(steps: Steps): Promise<void> {
		const { unchangedCountStart, unchangedCountEnd } = this.compare(steps);
		await this.rewindBefore(unchangedCountStart);
		this.currentSteps = steps.steps.map((step, i) => ({
			step,
			state:
				i < unchangedCountStart
					? this.currentSteps[i].state
					: { kind: "notRun" },
		}));
		this.stepDataChanged();
		await this.runAfter(this.currentSteps.length - 1 - unchangedCountEnd);
	}

	public async moveTo(stepId: string): Promise<void> {
		const idx = this.currentSteps.findIndex(s => s.step.id === stepId);
		console.log("move to ", stepId);
		if (idx < 0) {
			return;
		}

		await this.rewindBefore(idx);
		await this.runAfter(idx);
	}

	private async runAfter(stepIdx: number): Promise<void> {
		while (this.lastRanStepIdx < stepIdx) {
			const nextStep = this.currentSteps[this.lastRanStepIdx + 1];
			let arg = undefined;
			if (this.lastRanStepIdx >= 0) {
				const state = this.currentSteps[this.lastRanStepIdx].state;
				if (state.kind !== "ran") {
					throw new Error("Impossible");
				}
				arg = state.result;
			}
			nextStep.state = { kind: "running" };
			this.stepDataChanged();
			const undos = new Array<() => Promise<void>>();
			const result = await nextStep.step.do(arg, {
				onUndo: fn => undos.push(fn),
			});
			nextStep.state = { kind: "ran", result, undos };
			this.stepDataChanged();
			this.lastRanStepIdx++;
		}
	}

	private async rewindBefore(stepIdx: number): Promise<void> {
		while (this.lastRanStepIdx >= stepIdx) {
			const stepData = this.currentSteps[this.lastRanStepIdx];
			const state = stepData.state;
			if (state.kind !== "ran") {
				throw new Error("Should not happen");
			}
			stepData.state = { kind: "undoing" };
			this.stepDataChanged();
			state.undos.reverse();
			for (const undo of state.undos) {
				await undo();
			}
			stepData.state = { kind: "undone" };
			this.stepDataChanged();
			this.lastRanStepIdx--;
		}
	}

	private stepDataChanged() {
		this.stepStatesChangedEmitter.emit(this.getStepStates(), this);
	}

	private compare(
		steps: Steps
	): { unchangedCountStart: number; unchangedCountEnd: number } {
		const areEqual = (
			s1: StepData | undefined,
			s2: Step | undefined
		): boolean => {
			if (s1 === s2) {
				return true;
			}
			if (!s1 || !s2) {
				return false;
			}
			return this.areEqual(s1.step, s2);
		};

		let unchangedCountStart = 0;
		for (let i = 0; i < steps.steps.length; i++) {
			if (!areEqual(this.currentSteps[i], steps.steps[i])) {
				break;
			}
			unchangedCountStart++;
		}

		let unchangedCountEnd = 0;
		for (let i = 1; i <= steps.steps.length; i++) {
			const curStep = this.currentSteps[this.currentSteps.length - i];
			const newStep = steps.steps[steps.steps.length - i];
			if (!areEqual(curStep, newStep)) {
				break;
			}
			unchangedCountEnd++;
		}

		return { unchangedCountStart, unchangedCountEnd };
	}

	private areEqual(o1: unknown, o2: unknown): boolean {
		if (typeof o1 === "function" && typeof o2 === "function") {
			return o1.toString() === o2.toString();
		}

		if (typeof o1 === "object" && typeof o2 === "object") {
			if (o1 === null) {
				return o2 === null;
			}
			if (o2 === null) {
				return false;
			}
			for (const entry of diffObjectsKeys(o1, o2)) {
				if (!this.areEqual(entry.val1, entry.val2)) {
					return false;
				}
			}
			return true;
		}

		if (Array.isArray(o1) && Array.isArray(o2)) {
			if (o1.length !== o2.length) {
				return false;
			}
			for (let i = 0; i < o1.length; i++) {
				if (!this.areEqual(o1[i], o2[i])) {
					return false;
				}
			}
			return false;
		}

		return o1 == o2;
	}
}
