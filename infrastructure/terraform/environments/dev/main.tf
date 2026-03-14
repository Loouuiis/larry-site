terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Stage 1 intentionally keeps infrastructure light.
# We only define structure/placeholders so we can expand in Stage 2.

provider "aws" {
  region = var.region
}

locals {
  service_name = "larry"
  stage        = var.environment
}

output "stage" {
  value = local.stage
}
