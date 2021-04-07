## 什么是服务网格（Service Mesh）

它是为微服务提供基础公共服务的中间层，如微服务间的路由（服务发现）、负载均衡、认证授权、监控追踪 、流量控制等分布式系统所需要的基本功能。

其优势在于将通用能力从各微服务中提取出来，提高微服务的开发效率与运维成本。

相对而言其劣势在于通用能力集中于中间层，造成了网络延迟变高、稳定性依赖中间层的风险变高。