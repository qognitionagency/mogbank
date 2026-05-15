variable "gcp_project_id" {
  description = "GCP project ID for MogBank infrastructure"
  type        = string
}

variable "gcp_region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment (production, staging, development)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["production", "staging", "development"], var.environment)
    error_message = "Environment must be one of: production, staging, development"
  }
}

variable "domain" {
  description = "Root domain for MogBank"
  type        = string
  default     = "mogbank.io"
}

variable "github_token" {
  description = "GitHub personal access token"
  type        = string
  sensitive   = true
}

variable "db_tier" {
  description = "Cloud SQL instance tier"
  type        = string
  default     = "db-custom-2-8192"
}

variable "db_disk_size_gb" {
  description = "Cloud SQL disk size in GB"
  type        = number
  default     = 100
}

variable "db_availability" {
  description = "Cloud SQL availability type"
  type        = string
  default     = "ZONAL"

  validation {
    condition     = contains(["ZONAL", "REGIONAL"], var.db_availability)
    error_message = "Availability type must be ZONAL or REGIONAL"
  }
}

variable "redis_tier" {
  description = "Memorystore Redis tier"
  type        = string
  default     = "STANDARD_HA"
}

variable "redis_memory_gb" {
  description = "Memorystore Redis memory size in GB"
  type        = number
  default     = 5
}

variable "blocked_ip_ranges" {
  description = "IP ranges to block with Cloud Armor"
  type        = list(string)
  default     = []
}