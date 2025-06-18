// Type definitions for Squirrel.js Framework
declare module 'squirrel-framework' {
  
  // Basic component properties
  interface ComponentProps {
    id?: string;
    class?: string;
    style?: string | Record<string, any>;
    onclick?: (event: Event) => void;
    [key: string]: any;
  }

  // Button component
  interface ButtonProps extends ComponentProps {
    text?: string;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
  }

  // Slider component
  interface SliderProps extends ComponentProps {
    min?: number;
    max?: number;
    value?: number;
    step?: number;
    onchange?: (value: number) => void;
  }

  // Matrix component
  interface MatrixProps extends ComponentProps {
    rows?: number;
    cols?: number;
    data?: any[][];
    onCellClick?: (row: number, col: number, value: any) => void;
  }

  // Table component
  interface TableProps extends ComponentProps {
    headers?: string[];
    data?: any[][];
    sortable?: boolean;
    filterable?: boolean;
  }

  // List component
  interface ListProps extends ComponentProps {
    items?: any[];
    renderItem?: (item: any, index: number) => HTMLElement;
    onItemClick?: (item: any, index: number) => void;
  }

  // Draggable component
  interface DraggableProps extends ComponentProps {
    onDragStart?: (event: DragEvent) => void;
    onDragEnd?: (event: DragEvent) => void;
    onDrop?: (event: DragEvent) => void;
  }

  // Component factory functions
  export function Button(props?: ButtonProps): HTMLElement;
  export function Slider(props?: SliderProps): HTMLElement;
  export function Matrix(props?: MatrixProps): HTMLElement;
  export function Table(props?: TableProps): HTMLElement;
  export function List(props?: ListProps): HTMLElement;
  export function Menu(props?: ComponentProps): HTMLElement;
  export function Draggable(props?: DraggableProps): HTMLElement;
  export function Unit(props?: ComponentProps): HTMLElement;
  export function WaveSurfer(props?: ComponentProps): HTMLElement;

  // Framework utilities
  export interface SquirrelFramework {
    version: string;
    registerComponent: (name: string, factory: Function) => void;
    getComponent: (name: string) => Function | undefined;
    plugins: {
      register: (plugin: any) => void;
      get: (name: string) => any;
    };
  }

  // Default export
  const Squirrel: SquirrelFramework & {
    Button: typeof Button;
    Slider: typeof Slider;
    Matrix: typeof Matrix;
    Table: typeof Table;
    List: typeof List;
    Menu: typeof Menu;
    Draggable: typeof Draggable;
    Unit: typeof Unit;
    WaveSurfer: typeof WaveSurfer;
  };

  export default Squirrel;
}
