---
layout: post
title:  "linux协议栈调用流程"
date:   2019-05-21 11:29:00 +0800
categories: Kernel
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

## 桥收包
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
                       --->ip_route_input->ip_route_output
                       --->NF_HOOK_THRESH(NFPROTO_BRIDGE, NF_BR_PRE_ROUTING //走完剩下的hook点，大多情况已经没有
                       --->br_handle_frame_finish
                           --->br_forward
                           --->br_flood_forward
                           --->br_pass_frame_up //走本机协议栈
```
## 桥转发
```
 br_forward
  --->__br_forward
      --->NF_HOOK(NFPROTO_BRIDGE, NF_BR_FORWARD
          --->ebt_in_hook (ebtalbes forward filter)
          --->br_nf_forward_ip
              --->NF_HOOK(pf, NF_INET_FORWARD, skb
                  --->iptable_mangle_hook(NF_IP_PRI_MANGLE)
                  --->iptable_filter_hook(NF_IP_PRI_FILTER)
                  --->iptable_security_hook(NF_IP_PRI_SECURITY)
              --->br_nf_forward_finish
                  --->NF_HOOK(NFPROTO_BRIDGE, NF_BR_POST_ROUTING,
                      --->ebt_do_table(NF_BR_PRI_NAT_SRC)
                      --->br_nf_post_routing(NF_BR_PRI_LAST)
                          --->NF_HOOK(pf, NF_INET_POST_ROUTING,
                              --->iptable_nat_ipv4_out(NF_IP_PRI_NAT_SRC)
                              --->selinux_ipv4_postroute(NF_IP_PRI_SELINUX_LAST)
                              --->ipv4_helper(NF_IP_PRI_CONNTRACK_HELPER) ???干什么用的
                              --->ipv4_confirm(NF_IP_PRI_CONNTRACK_CONFIRM)
                          --->br_nf_dev_queue_xmit
             
 

````

## ip收包
```
 ip_rcv(ip头长度、检验和检查等)
   --->NF_HOOK(NFPROTO_IPV4, NF_INET_PRE_ROUTING,
        --->ip_sabotage_in(NF_IP_PRI_FIRST)
        --->ipv4_conntrack_defrag(NF_IP_PRI_CONNTRACK_DEFRAG)
        --->iptable_raw_hook(NF_IP_PRI_RAW)
        --->ipv4_conntrack_in(NF_IP_PRI_CONNTRACK）
        --->iptable_mangle_hook(NF_IP_PRI_MANGLE)
   --->ip_rcv_finish
        --->ip_route_input_noref(查路由)(mkroute->dst.input= ip_local_deliver/ip_forward)
        --->dst_input->ip_local_deliver/ip_forward
        
```

## 路由转发
```
 ip_forward
   --->NF_HOOK(NFPROTO_IPV4, NF_INET_FORWARD
      --->iptable_mangle_hook(NF_IP_PRI_MANGLE)
      --->iptable_filter_hook(NF_IP_PRI_FILTER)
      --->iptable_security_hook(NF_IP_PRI_SECURITY)
   --->ip_forward_finish
      --->dst_output
         --->ip_output
             --->NF_HOOK_COND(NFPROTO_IPV4, NF_INET_POST_ROUTING
                 --->iptable_nat_ipv4_out(NF_IP_PRI_NAT_SRC)
                 --->selinux_ipv4_postroute(NF_IP_PRI_SELINUX_LAST)
                 --->ipv4_helper(NF_IP_PRI_CONNTRACK_HELPER) ???干什么用的
                 --->ipv4_confirm(NF_IP_PRI_CONNTRACK_CONFIRM)
             --->ip_finish_output
                 --->ip_finish_output2
                     --->__ipv4_neigh_lookup_noref(路由查到下一跳ip，但要通过neigh查找下一设备的mac）
                     --->dev_queue_xmit(指定接口发出）
```

### 本机收包
```
 ip_local_deliver/br_pass_frame_up
 NF_HOOK(NFPROTO_IPV4, NF_INET_LOCAL_IN
        --->iptable_mangle_hook(NF_IP_PRI_MANGLE)
        --->iptable_filter_hook(NF_IP_PRI_FILTER)
        --->iptable_security_hook(NF_IP_PRI_SECURITY)
        --->iptable_nat_ipv4_fn(NF_IP_PRI_NAT_SRC)
        --->ipv4_helper(NF_IP_PRI_CONNTRACK_HELPER) ???干什么用的
        --->ipv4_confirm(NF_IP_PRI_CONNTRACK_CONFIRM)
  --->ip_local_deliver_finish
      --->raw_local_deliver(socket raw)
      --->ipprot->handler(tcp_v4_rcv)
```

## 本机外发
```
 tcp_sendmsg->tcp_push_one--->tcp_write_xmit->tcp_transmit_skb
  --->icsk->icsk_af_ops->queue_xmit(ip_queue_xmit)
      --->ip_queue_xmit
          --->ip_route_output_ports(查路由）
          --->ip_local_out->ip_local_out_sk->__ip_local_out
              --->nf_hook(NFPROTO_IPV4, NF_INET_LOCAL_OUT
                         --->iptable_raw_hook(NF_IP_PRI_RAW)
                         --->selinux_ipv4_output(NF_IP_PRI_SELINUX_FIRST)
                         --->ipv4_conntrack_local(NF_IP_PRI_CONNTRACK)
                         --->iptable_mangle_hook(NF_IP_PRI_MANGLE)
                         --->iptable_nat_ipv4_local_fn(NF_IP_PRI_NAT_DST)
                         --->iptable_filter_hook(NF_IP_PRI_FILTER)
                         --->iptable_security_hook(NF_IP_PRI_SECURITY)
                         --->iptable_nat_ipv4_local_fn(NF_IP_PRI_NAT_DST)
                         --->selinux_ipv4_output(NF_IP_PRI_SELINUX_FIRST)
                         --->ipv4_conntrack_local(NF_IP_PRI_CONNTRACK)
                  --->dst_output->dst_output_sk
                      --->ip_output
                          --->NF_HOOK_COND(NFPROTO_IPV4, NF_INET_POST_ROUTING, 
                              --->iptable_nat_ipv4_out(NF_IP_PRI_NAT_SRC)
                              --->selinux_ipv4_postroute(NF_IP_PRI_SELINUX_LAST)
                              --->ipv4_helper(NF_IP_PRI_CONNTRACK_HELPER) ???干什么用的
                              --->ipv4_confirm(NF_IP_PRI_CONNTRACK_CONFIRM)
                          --->ip_finish_output
                              --->ip_finish_output2
                                   --->__ipv4_neigh_lookup_noref(路由查到下一跳ip，但要通过neigh查找下一设备的mac）
                                       --->dev_queue_xmit(指定接口发出）

```

## tcp sock注册
```
 tcp_v4_init_sock
   --->icsk->icsk_af_ops = &ipv4_specific
```

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
```

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
