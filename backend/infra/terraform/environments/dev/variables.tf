variable "environment" {
  type    = string
  default = "dev"
}

variable "region" {
  type    = string
  default = "eu-west-1"
}

variable "vpc_cidr" {
  type    = string
  default = "10.42.0.0/16"
}

variable "db_username" {
  type    = string
  default = "larry"
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "allowed_cidr_blocks" {
  type    = list(string)
  default = ["0.0.0.0/0"]
}
