class AtomeContractError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'AtomeContractError';
        this.details = details;
    }
}

export { AtomeContractError };
