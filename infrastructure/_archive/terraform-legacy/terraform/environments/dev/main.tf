terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

module "core" {
  source = "../../modules/core"

  environment           = var.environment
  region                = var.region
  vpc_cidr              = var.vpc_cidr
  db_username           = var.db_username
  db_password           = var.db_password
  allowed_cidr_blocks   = var.allowed_cidr_blocks
}

output "api_db_endpoint" {
  value = module.core.db_endpoint
}

output "events_queue_url" {
  value = module.core.events_queue_url
}

output "artifact_bucket" {
  value = module.core.artifact_bucket
}
