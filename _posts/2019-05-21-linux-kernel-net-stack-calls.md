---
layout: post
title:  "linux协议栈调用流程"
date:   2019-05-21 11:29:00 +0800
categories: Code
---

## 接收(软&硬中断处理）
```
  * 硬中断处理
  ixgbe_msix_clean_rings ->  napi_schedule(&q_vector->napi) -> napi_schedule_prep -> __napi_schedule -> 
  ____napi_schedule(this_cpu_ptr(&softnet_data), n) 
  -> list_add_tail(&napi->poll_list, &sd->poll_list) -> __raise_softirq_irqoff(NET_RX_SOFTIRQ)
  
  * 软中断处理
  net_rx_action -> n->poll (ixgbe_poll) -> ixgbe_clean_rx_irq -> ixgbe_rx_skb -> netif_receive_skb ->
  netif_receive_skb_internal -> __netif_receive_skb -> __netif_receive_skb_core
          |--->ptype_all (pf_packet)
  ----    |--->skb->dev->rx_handler (bridge)
          |--->ptype_base (ip_rcv)
```

## 桥转发
```
  skb->dev->rx_handler (bridge)
  -> br_handle_frame 
      |---> br_should_route_hook -> ebt_route -> ebt_do_table(NF_BR_BROUTING,...) -> ebtalbes routing hooks
  --- |
      |---> NF_HOOK(NFPROTO_BRIDGE, NF_BR_PRE_ROUTING, skb, skb->dev, NULL,br_handle_frame_finish);
            ---> ebt_nat_in (NF_BR_PRI_NAT_DST_BRIDGED) 
            ---> br_nf_pre_routing(NF_BR_PRI_BRNF) 
                  ---> NF_HOOK(NFPROTO_IPV4, NF_INET_PRE_ROUTING
                       --->ip_sabotage_in(NF_IP_PRI_FIRST)
                       --->ipv4_conntrack_defrag(NF_IP_PRI_CONNTRACK_DEFRAG)
                       --->iptable_raw_hook(NF_IP_PRI_RAW)
                       --->ipv4_conntrack_in(NF_IP_PRI_CONNTRACK）
                       --->iptable_mangle_hook(NF_IP_PRI_MANGLE)
                  --->br_nf_pre_routing_finish
                       --->
                       
                                         
            
  

## 收到本机

## 路由转发

## 本机外发

## 硬件中断注册
```
ifconfig eth0 up
   -> ixgbe_open -> ixgbe_request_irq -> ixgbe_request_msix_irqs(支持多队列) 
                  -> request_irq -> Set Callback -> ixgbe_msix_clean_rings
```

## 软中断注册
```
  subsys_initcall(net_dev_init) -> net_dev_init -> open_softirq(NET_RX_SOFTIRQ, net_rx_action) 
  -> softirq_vec[nr].action = action
  
```

## napi poll 注册
```
  insmod ixgbe.ko 
  -> ixgbe_probe ->ixgbe_init_interrupt_scheme -> ixgbe_alloc_q_vectors -> ixgbe_alloc_q_vector ->
  netif_napi_add(adapter->netdev, &q_vector->napi,ixgbe_poll, 64);

## ip协议注册
```
  fs_initcall(inet_init)
  ->inet_init ->dev_add_pack ( ip_packet_type {.func = ip_rcv})
```

## 桥注册
```
  brctl add eth0 -> dev_ioctl ->
  br_add_if -> netdev_rx_handler_register (dev, br_handle_frame, p) ->rcu_assign_pointer(dev->rx_handler, rx_handler)
  -> rx_handler = br_handle_frame
```
