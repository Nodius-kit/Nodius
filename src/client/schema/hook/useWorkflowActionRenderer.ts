import {createElement, useContext, useEffect, useRef} from "react";
import {useDynamicClass} from "../../hooks/useDynamicClass";
import {useStableProjectRef} from "../../hooks/useStableProjectRef";
import {ProjectContext} from "../../hooks/contexts/ProjectContext";

interface WorkflowDisplay {
    container: HTMLElement;
    wfButton: HTMLButtonElement;
}

interface WorkflowCallback {
    start: () => void;
    stop: () => void;
}

interface useWorkflowActionRendererProps {
    workflowCallback:WorkflowCallback
}

export const useWorkflowActionRenderer = ({
    workflowCallback
}: useWorkflowActionRendererProps) => {

    const workflowDisplay = useRef<WorkflowDisplay>(undefined);

    const Project = useContext(ProjectContext);

    const callback = useRef<WorkflowCallback>(undefined);

    useEffect(() => {
        callback.current = workflowCallback;
    }, [workflowCallback])

    const actionClass = useDynamicClass(`
        & {
            position: absolute;
            top: -46px;
            right: 8px;
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 6px 10px;
            background-color: var(--nodius-background-paper);
            border-radius: 8px;
            border: 1px solid var(--nodius-primary-dark);
            box-shadow: var(--nodius-shadow-2);
            z-index: 10;
            transition: var(--nodius-transition-default);
            pointer-events: all;
        }
        & .switchLabel {
            position: relative;
            display: inline-block;
            width: 40px;
            height: 22px;
        }
        & .label {
            font-size: 12px;
            font-weight: 600;
            color: var(--nodius-text-primary);
            cursor: pointer;
            user-select: none;
        }
        
        & input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        
        & .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: var(--nodius-grey-600);
            transition: var(--nodius-transition-default);
            border-radius: 22px;
        }
        & .slider.checked {
            background-color: var(--nodius-success-main);
        }
        
        & .sliderBefore {
            position: absolute;
            content: '';
            height: 16px;
            width: 16px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: var(--nodius-transition-default);
            border-radius: 50%;
            transform: translateX(0);
        }
        & .sliderBefore.active {
            transform: translateX(18px);
        }
        
        & button {
            padding: 4px 12px;
            background-color: var(--nodius-primary-main);
            color: var(--nodius-primary-contrastText);
            border: none;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: var(--nodius-transition-default);
        }
        & button:hover {
            background-color: var(--nodius-primary-dark);
        }
        
        & .rotate {
        
        }
    
    `);

    useEffect(() => {
        updateWorkFlowButton();
    }, [Project.state.workFlowState]);

    const updateWorkFlowButton = () => {
        if(!workflowDisplay.current) return;
        if(Project.state.workFlowState.active) {

            if(Project.state.workFlowState.executing) {
                workflowDisplay.current.wfButton.innerHTML = `
                    <div class="rotate">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-circle-icon lucide-loader-circle"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    </div>
                `;
            } else {
                workflowDisplay.current.wfButton.textContent = "Dispose";

            }

            workflowDisplay.current.wfButton.onclick = () => {
                if(!callback.current) return;
                callback.current.stop();
            }
        } else {
            workflowDisplay.current.wfButton.textContent = "Start WorkFlow";
            workflowDisplay.current.wfButton.onclick = () => {
                if(!callback.current) return;
                callback.current.start();
            }
        }

    }



    const renderWorkflowAction = (nodeKey:string, nodeContainer:HTMLElement) => {
        const container = document.createElement('div');
        container.className = actionClass;

        /*const switchLabel = document.createElement("label");
        switchLabel.className = "switchLabel";

        const checkbox = document.createElement("input");
        checkbox.id = "workflow-checkbox-"+nodeKey;

        const slider = document.createElement("span");
        slider.className = "slider";

        const sliderBefore = document.createElement("span");
        sliderBefore.className = "sliderBefore";

        const label = document.createElement("label");
        label.className = "label";
        label.innerHTML = "Start Workflow";
        label.htmlFor = checkbox.id;

        slider.appendChild(sliderBefore);
        switchLabel.appendChild(checkbox);
        switchLabel.appendChild(slider);

        container.appendChild(label);
        container.appendChild(switchLabel);*/

        const wfButton = document.createElement("button");
        container.appendChild(wfButton);

        nodeContainer.appendChild(container);

        workflowDisplay.current = {
            container: container,
            wfButton: wfButton,
        }
        updateWorkFlowButton();

    }

    const disposeWorkflowAction = () => {
        if(workflowDisplay.current) {
            workflowDisplay.current.container.remove();
            workflowDisplay.current = undefined;
        }
    }



    return {
        renderWorkflowAction,
        disposeWorkflowAction,
        updateWorkFlowButton
    }
}