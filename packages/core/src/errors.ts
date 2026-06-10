export class CraftDagError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends CraftDagError {
  constructor(message: string, public readonly details?: any) {
    super(message);
  }
}

export class GraphError extends CraftDagError {
  constructor(message: string, public readonly details?: any) {
    super(message);
  }
}

export class CompileError extends CraftDagError {
  constructor(message: string, public readonly details?: any) {
    super(message);
  }
}
