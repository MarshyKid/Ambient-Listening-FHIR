interface StepperProps {
  steps: string[];
  currentStep: number;
  onStepClick: (step: number) => void;
}

export default function Stepper({ steps, currentStep, onStepClick }: StepperProps) {
  return (
    <nav className="stepper" aria-label="Workflow steps">
      {steps.map((step, index) => {
        const isComplete = index < currentStep;
        const isCurrent = index === currentStep;
        const canClick = isComplete || isCurrent;

        return (
          <button
            key={step}
            type="button"
            className={`step ${isComplete ? "complete" : ""} ${isCurrent ? "current" : ""}`}
            onClick={() => canClick && onStepClick(index)}
            disabled={!canClick}
            aria-current={isCurrent ? "step" : undefined}
          >
            <span className="step-index">{index + 1}</span>
            <span>{step}</span>
          </button>
        );
      })}
    </nav>
  );
}
