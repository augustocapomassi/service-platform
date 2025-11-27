// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title EscrowService
 * @dev Smart Contract para gestionar servicios P2P con custodia (escrow)
 */
contract EscrowService {
    enum JobStatus {
        PENDING,
        IN_PROGRESS,
        COMPLETED,
        DISPUTED,
        CANCELLED
    }

    struct Job {
        uint256 jobId;
        address client;
        address provider;
        uint256 amount;
        JobStatus status;
        bool clientConfirmed;
        bool providerConfirmed;
        uint256 createdAt;
        string category; // e.g., "PLOMERIA", "ELECTRICIDAD"
    }

    // Mapping from jobId to Job
    mapping(uint256 => Job) public jobs;
    
    // Counter for job IDs
    uint256 private jobCounter;
    
    // Events
    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed provider,
        uint256 amount,
        string category
    );
    
    event JobStatusUpdated(
        uint256 indexed jobId,
        JobStatus newStatus
    );
    
    event CompletionConfirmed(
        uint256 indexed jobId,
        address indexed confirmer,
        bool isClient
    );
    
    event DisputeRaised(
        uint256 indexed jobId,
        address indexed raiser
    );
    
    event DisputeResolved(
        uint256 indexed jobId,
        address indexed winner,
        uint256 amountReleased
    );
    
    event FundsReleased(
        uint256 indexed jobId,
        address indexed recipient,
        uint256 amount
    );

    modifier onlyJobParticipant(uint256 _jobId) {
        Job memory job = jobs[_jobId];
        require(
            msg.sender == job.client || msg.sender == job.provider,
            "Not a participant in this job"
        );
        _;
    }

    modifier jobExists(uint256 _jobId) {
        require(_jobId > 0 && _jobId <= jobCounter, "Job does not exist");
        _;
    }

    /**
     * @dev Creates a new job with escrow
     * @param _provider Address of the service provider
     * @param _category Category of the service
     */
    function createJob(
        address _provider,
        string memory _category
    ) external payable {
        require(_provider != address(0), "Invalid provider address");
        require(_provider != msg.sender, "Provider cannot be client");
        require(msg.value > 0, "Amount must be greater than 0");
        require(bytes(_category).length > 0, "Category cannot be empty");

        jobCounter++;
        
        jobs[jobCounter] = Job({
            jobId: jobCounter,
            client: msg.sender,
            provider: _provider,
            amount: msg.value,
            status: JobStatus.PENDING,
            clientConfirmed: false,
            providerConfirmed: false,
            createdAt: block.timestamp,
            category: _category
        });

        emit JobCreated(
            jobCounter,
            msg.sender,
            _provider,
            msg.value,
            _category
        );
    }

    /**
     * @dev Provider accepts the job
     * @param _jobId ID of the job
     */
    function acceptJob(uint256 _jobId) 
        external 
        jobExists(_jobId) 
    {
        Job storage job = jobs[_jobId];
        require(msg.sender == job.provider, "Only provider can accept");
        require(job.status == JobStatus.PENDING, "Job not in PENDING status");
        
        job.status = JobStatus.IN_PROGRESS;
        
        emit JobStatusUpdated(_jobId, JobStatus.IN_PROGRESS);
    }

    /**
     * @dev Confirms job completion (client or provider)
     * @param _jobId ID of the job
     */
    function confirmCompletion(uint256 _jobId) 
        external 
        jobExists(_jobId) 
        onlyJobParticipant(_jobId) 
    {
        Job storage job = jobs[_jobId];
        require(
            job.status == JobStatus.IN_PROGRESS || job.status == JobStatus.COMPLETED,
            "Job must be in progress"
        );

        if (msg.sender == job.client) {
            require(!job.clientConfirmed, "Client already confirmed");
            job.clientConfirmed = true;
        } else {
            require(!job.providerConfirmed, "Provider already confirmed");
            job.providerConfirmed = true;
        }

        emit CompletionConfirmed(_jobId, msg.sender, msg.sender == job.client);

        // If both parties confirmed, mark as completed and release funds
        if (job.clientConfirmed && job.providerConfirmed) {
            job.status = JobStatus.COMPLETED;
            emit JobStatusUpdated(_jobId, JobStatus.COMPLETED);
            
            // Release funds to provider
            (bool success, ) = payable(job.provider).call{value: job.amount}("");
            require(success, "Transfer failed");
            
            emit FundsReleased(_jobId, job.provider, job.amount);
        }
    }

    /**
     * @dev Raises a dispute for a job
     * @param _jobId ID of the job
     */
    function raiseDispute(uint256 _jobId) 
        external 
        jobExists(_jobId) 
        onlyJobParticipant(_jobId) 
    {
        Job storage job = jobs[_jobId];
        require(
            job.status == JobStatus.IN_PROGRESS || job.status == JobStatus.COMPLETED,
            "Cannot raise dispute in current status"
        );
        
        job.status = JobStatus.DISPUTED;
        
        emit DisputeRaised(_jobId, msg.sender);
        emit JobStatusUpdated(_jobId, JobStatus.DISPUTED);
    }

    /**
     * @dev Resolves a dispute (only owner/admin in production, simplified for MVP)
     * @param _jobId ID of the job
     * @param _winner Address that wins the dispute (client or provider)
     */
    function resolveDispute(
        uint256 _jobId,
        address _winner
    ) external jobExists(_jobId) {
        Job storage job = jobs[_jobId];
        require(job.status == JobStatus.DISPUTED, "Job not in dispute");
        require(
            _winner == job.client || _winner == job.provider,
            "Winner must be a participant"
        );

        job.status = JobStatus.COMPLETED;
        
        // Release funds to winner
        (bool success, ) = payable(_winner).call{value: job.amount}("");
        require(success, "Transfer failed");
        
        emit DisputeResolved(_jobId, _winner, job.amount);
        emit FundsReleased(_jobId, _winner, job.amount);
        emit JobStatusUpdated(_jobId, JobStatus.COMPLETED);
    }

    /**
     * @dev Cancels a pending job (only client)
     * @param _jobId ID of the job
     */
    function cancelJob(uint256 _jobId) 
        external 
        jobExists(_jobId) 
    {
        Job storage job = jobs[_jobId];
        require(msg.sender == job.client, "Only client can cancel");
        require(job.status == JobStatus.PENDING, "Can only cancel pending jobs");
        
        job.status = JobStatus.CANCELLED;
        
        // Refund to client
        (bool success, ) = payable(job.client).call{value: job.amount}("");
        require(success, "Transfer failed");
        
        emit JobStatusUpdated(_jobId, JobStatus.CANCELLED);
        emit FundsReleased(_jobId, job.client, job.amount);
    }

    /**
     * @dev Gets job details
     * @param _jobId ID of the job
     */
    function getJob(uint256 _jobId) 
        external 
        view 
        jobExists(_jobId) 
        returns (Job memory) 
    {
        return jobs[_jobId];
    }

    /**
     * @dev Gets the current job counter
     */
    function getJobCounter() external view returns (uint256) {
        return jobCounter;
    }
}


